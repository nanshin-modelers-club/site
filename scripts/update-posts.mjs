/**
 * note / はてなブログのRSSを取得して index.html の「お知らせ」欄に差し込む。
 *
 *   node scripts/update-posts.mjs
 *
 * 環境変数（未指定なら下の既定値）
 *   FEED_URL   … RSSのURL
 *   POST_COUNT … 載せる件数
 *
 * 外部パッケージは使いません。Node 18 以降の fetch のみで動きます。
 * 取得に失敗したときは index.html を書き換えずに異常終了します。
 * （= サイトには前回の内容が残り、GitHubから失敗通知メールが届きます）
 */

import { readFile, writeFile } from 'node:fs/promises';

// ---- 設定 -------------------------------------------------------------

const FEED_URL = process.env.FEED_URL || 'https://note.com/CHANGE_ME/rss';
const POST_COUNT = Number(process.env.POST_COUNT || 3);

const HTML_PATH = 'index.html';
const JSON_PATH = 'posts.json';

const POSTS_START = '<!-- posts:start -->';
const POSTS_END = '<!-- posts:end -->';
const UPDATED_START = '<!-- updated:start -->';
const UPDATED_END = '<!-- updated:end -->';

const USER_AGENT =
  'nanshin-mokei-club-site/1.0 (+https://github.com/; contact via site)';

// ---- RSSの取得 --------------------------------------------------------

async function fetchFeed(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'ja',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const body = await res.text();
      if (!body.includes('<item')) throw new Error('RSSに<item>が見つかりません');
      return body;
    } catch (err) {
      lastError = err;
      console.warn(`取得に失敗しました（${i}/${attempts}）: ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 3000));
    }
  }
  throw lastError;
}

// ---- ごく小さなRSSパーサ ----------------------------------------------

function decodeEntities(input) {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&'); // &amp; は最後
}

function tagText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeEntities(m[1]).trim() : '';
}

function attrValue(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = xml.match(re);
  return m ? decodeEntities(m[1]).trim() : '';
}

/**
 * description の中身はHTMLが二重にエスケープされていることがあるため、
 * タグを落としたあとにもう一度エンティティを戻す。
 */
function toPlainText(html) {
  const stripped = html.replace(/<[^>]*>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max).join('') + '…';
}

function parseFeed(xml, limit) {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(
    (m) => m[1]
  );

  return items.slice(0, limit).map((item) => {
    const raw = tagText(item, 'description') || tagText(item, 'content:encoded');
    const published = tagText(item, 'pubDate') || tagText(item, 'dc:date');
    const thumb =
      attrValue(item, 'media:thumbnail', 'url') ||
      attrValue(item, 'enclosure', 'url') ||
      '';

    return {
      title: tagText(item, 'title'),
      url: tagText(item, 'link') || attrValue(item, 'link', 'href'),
      publishedAt: published ? new Date(published).toISOString() : null,
      excerpt: truncate(toPlainText(raw), 90),
      thumbnail: thumb,
    };
  });
}

// ---- HTMLの組み立て ---------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tokyo',
});

function formatDate(iso) {
  if (!iso) return '';
  return dateFormatter.format(new Date(iso));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPosts(posts) {
  if (posts.length === 0) {
    return '    <p class="empty">まだ記事がありません。</p>';
  }

  const items = posts.map((post) => {
    const thumb = post.thumbnail
      ? `\n          <img class="post__thumb" src="${escapeHtml(post.thumbnail)}" alt="" loading="lazy">`
      : '';
    const date = post.publishedAt
      ? `\n            <time class="post__date" datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(formatDate(post.publishedAt))}</time>`
      : '';
    const excerpt = post.excerpt
      ? `\n            <span class="post__excerpt">${escapeHtml(post.excerpt)}</span>`
      : '';

    return [
      '      <li>',
      `        <a class="post" href="${escapeHtml(post.url)}">${thumb}`,
      '          <span class="post__body">' + date,
      `            <span class="post__title">${escapeHtml(post.title)}</span>${excerpt}`,
      '          </span>',
      '        </a>',
      '      </li>',
    ].join('\n');
  });

  return ['    <ul class="posts">', ...items, '    </ul>'].join('\n');
}

// ---- マーカーへの差し込み ---------------------------------------------

function replaceBetween(html, start, end, replacement, label) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      `${HTML_PATH} に ${label} のマーカーが見つかりません（${start} / ${end}）`
    );
  }
  return html.slice(0, from + start.length) + replacement + html.slice(to);
}

// ---- 実行 -------------------------------------------------------------

async function main() {
  if (FEED_URL.includes('CHANGE_ME')) {
    throw new Error(
      'FEED_URL が設定されていません。リポジトリの Settings → Secrets and variables → Actions → Variables に FEED_URL を登録してください。'
    );
  }

  console.log(`RSSを取得します: ${FEED_URL}`);
  const xml = await fetchFeed(FEED_URL);
  const posts = parseFeed(xml, POST_COUNT);
  console.log(`${posts.length}件を取り込みました。`);
  for (const post of posts) console.log(`  - ${formatDate(post.publishedAt)} ${post.title}`);

  const latest = posts.find((post) => post.publishedAt)?.publishedAt ?? null;

  await writeFile(
    JSON_PATH,
    JSON.stringify(
      { source: FEED_URL, fetchedAt: new Date().toISOString(), posts },
      null,
      2
    ) + '\n',
    'utf8'
  );

  let html = await readFile(HTML_PATH, 'utf8');
  html = replaceBetween(
    html,
    POSTS_START,
    POSTS_END,
    '\n' + renderPosts(posts) + '\n    ',
    'お知らせ'
  );
  html = replaceBetween(
    html,
    UPDATED_START,
    UPDATED_END,
    latest ? formatDate(latest) : '—',
    '最終更新'
  );
  await writeFile(HTML_PATH, html, 'utf8');

  console.log(`${HTML_PATH} と ${JSON_PATH} を更新しました。`);
}

main().catch((err) => {
  console.error(`失敗しました: ${err.message}`);
  console.error('index.html は変更していません。');
  process.exit(1);
});
