#!/usr/bin/env bun
/**
 * Generate Open Agent Wiki Visualization
 *
 * Creates a single HTML file with tree and graph views,
 * powered by hypergraph data from Ensue.
 *
 * Usage: bun scripts/generate-wiki-viz.js
 * Output: wiki-viz.html
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

function getApiKey() {
    if (process.env.ENSUE_API_KEY) return process.env.ENSUE_API_KEY;
    const keyFile = join(PLUGIN_ROOT, '.ensue-key');
    if (existsSync(keyFile)) return readFileSync(keyFile, 'utf-8').trim();
    console.error('Error: ENSUE_API_KEY not set.');
    process.exit(1);
}

async function ensueApi(method, args = {}) {
    const apiKey = getApiKey();
    const response = await fetch('https://api.ensue-network.ai/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: method, arguments: args },
            id: 1,
        }),
    });
    let text = await response.text();
    if (text.startsWith('data: ')) text = text.replace(/^data: /, '');
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error.message);
    return data.result?.structuredContent;
}

// Parse description metadata: "summary | by:org | type:compiled | v:1"
function parseDescription(desc) {
    if (!desc) return { summary: '', creator: 'unknown', type: 'compiled', version: 1, supersedes: null };
    const parts = desc.split(' | ');
    const summary = parts[0] || '';
    let creator = 'unknown', type = 'compiled', version = 1, supersedes = null;
    for (const part of parts.slice(1)) {
        if (part.startsWith('by:')) creator = part.slice(3);
        else if (part.startsWith('type:')) type = part.slice(5);
        else if (part.startsWith('v:')) version = parseInt(part.slice(2)) || 1;
        else if (part.startsWith('supersedes:')) supersedes = part.slice(11);
    }
    return { summary, creator, type, version, supersedes };
}

// Parse hypergraph compact notation
function parseHypergraph(text) {
    if (!text) return { nodes: [], edges: [] };
    const lines = text.split('\n').filter(l => l.trim());
    const nodes = [];
    const edges = [];
    for (const line of lines) {
        if (line.startsWith('N:')) {
            const match = line.match(/^N:(\d+)\|([^|]+)\|(.+)$/);
            if (match) nodes.push({ id: parseInt(match[1]), key: match[2], desc: match[3] });
        } else if (line.startsWith('E:')) {
            const match = line.match(/^E:([^|]+)\|([\d,]+)\|(.+)$/);
            if (match) {
                const nodeIds = match[2].split(',').map(Number);
                edges.push({ label: match[1], nodeIds, desc: match[3] });
            }
        }
    }
    return { nodes, edges };
}

async function fetchKeys(prefix) {
    console.log(`Fetching ${prefix} keys...`);
    const result = await ensueApi('list_keys', { prefix, limit: 500 });
    return result?.keys || [];
}

async function fetchContent(keys) {
    const keyNames = keys.map(k => k.key_name).filter(k => !k.endsWith('/_index') && !k.includes('::done'));
    const batchSize = 10;
    const contents = {};
    for (let i = 0; i < keyNames.length; i += batchSize) {
        const batch = keyNames.slice(i, i + batchSize);
        const result = await ensueApi('get_memory', { key_names: batch });
        if (result?.results) {
            for (const item of result.results) {
                if (item.value) contents[item.key_name] = item.value;
            }
        }
        process.stdout.write(`\r  Fetched ${Math.min(i + batchSize, keyNames.length)}/${keyNames.length} entries`);
    }
    console.log('');
    return contents;
}

async function fetchHypergraph() {
    console.log('Fetching hypergraph...');
    try {
        const result = await ensueApi('get_memory', { key_names: ['wiki/_graph/full'] });
        if (result?.results?.[0]?.value) return parseHypergraph(result.results[0].value);
    } catch (e) { /* no hypergraph yet */ }
    return { nodes: [], edges: [] };
}

// Filter to latest versions only
function getLatestVersions(keys) {
    const latest = new Map(); // base key -> { key, version }
    for (const key of keys) {
        const name = key.key_name;
        if (name.includes('/_index') || name.includes('/_graph/') || name.includes('::done')) continue;
        const versionMatch = name.match(/^(.+?)::(\d+)$/);
        const baseKey = versionMatch ? versionMatch[1] : name;
        const version = versionMatch ? parseInt(versionMatch[2]) : 1;
        const existing = latest.get(baseKey);
        if (!existing || version > existing.version) {
            latest.set(baseKey, { ...key, baseKey, version, originalKey: name });
        }
    }
    return [...latest.values()];
}

function buildTree(wikiKeys, contents) {
    const tree = { name: 'Open Agent Wiki', type: 'root', icon: '🌐', children: [] };
    const topics = {};

    for (const key of wikiKeys) {
        const parts = key.baseKey.replace('wiki/', '').split('/');
        const topic = parts[0];
        const article = parts.slice(1).join('/');
        if (!article) continue;

        const meta = parseDescription(key.description);

        if (!topics[topic]) topics[topic] = [];
        topics[topic].push({
            name: article,
            key: key.originalKey,
            baseKey: key.baseKey,
            description: meta.summary,
            content: contents[key.originalKey] || contents[key.baseKey] || '',
            creator: meta.creator,
            type: meta.type,
            version: meta.version,
        });
    }

    const topicIcons = {
        ai: '🤖', engineering: '⚙️', science: '🔬', tools: '🛠️',
        society: '🏛️', math: '📐', data: '📊', security: '🔒',
        connections: '🔗',
    };

    for (const [topic, articles] of Object.entries(topics).sort((a, b) => a[0].localeCompare(b[0]))) {
        tree.children.push({
            name: topic,
            type: 'topic',
            icon: topicIcons[topic] || '📁',
            children: articles.sort((a, b) => a.name.localeCompare(b.name)),
        });
    }
    return tree;
}

function buildGraph(wikiKeys, contents, hypergraph) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const topics = new Set();

    // Collect topics
    for (const key of wikiKeys) {
        const topic = key.baseKey.replace('wiki/', '').split('/')[0];
        topics.add(topic);
    }

    // Topic nodes
    for (const topic of topics) {
        nodes.push({ id: `topic:${topic}`, name: topic, type: 'topic', size: 40 });
        nodeMap.set(`topic:${topic}`, true);
    }

    // Article nodes — compute centrality from hypergraph
    const centralityMap = new Map();
    if (hypergraph.edges.length > 0) {
        for (const edge of hypergraph.edges) {
            for (const nodeId of edge.nodeIds) {
                const hgNode = hypergraph.nodes.find(n => n.id === nodeId);
                if (hgNode) {
                    centralityMap.set(hgNode.key, (centralityMap.get(hgNode.key) || 0) + 1);
                }
            }
        }
    }

    for (const key of wikiKeys) {
        const parts = key.baseKey.replace('wiki/', '').split('/');
        const topic = parts[0];
        const article = parts.slice(1).join('/');
        if (!article) continue;

        const meta = parseDescription(key.description);
        const centrality = centralityMap.get(key.originalKey) || centralityMap.get(key.baseKey) || 0;
        const baseSize = 14;
        const size = baseSize + centrality * 4;

        nodes.push({
            id: key.baseKey,
            name: article,
            fullKey: key.originalKey,
            description: meta.summary,
            content: contents[key.originalKey] || '',
            creator: meta.creator,
            entryType: meta.type,
            version: meta.version,
            centrality,
            topic,
            size: Math.min(size, 50),
        });
        nodeMap.set(key.baseKey, true);
        links.push({ source: `topic:${topic}`, target: key.baseKey, type: 'hierarchy' });
    }

    // Hypergraph edges — connect nodes within the same edge
    if (hypergraph.edges.length > 0) {
        for (const edge of hypergraph.edges) {
            const edgeKeys = edge.nodeIds
                .map(id => hypergraph.nodes.find(n => n.id === id)?.key)
                .filter(k => k && nodeMap.has(k));

            for (let i = 0; i < edgeKeys.length; i++) {
                for (let j = i + 1; j < edgeKeys.length; j++) {
                    links.push({
                        source: edgeKeys[i],
                        target: edgeKeys[j],
                        type: 'hypergraph',
                        label: edge.desc,
                    });
                }
            }
        }
    } else {
        // Fallback: keyword-based connections when no hypergraph exists
        const articleNodes = nodes.filter(n => n.type !== 'topic');
        for (let i = 0; i < articleNodes.length; i++) {
            for (let j = i + 1; j < articleNodes.length; j++) {
                const a = articleNodes[i], b = articleNodes[j];
                const aWords = new Set((a.name + ' ' + a.description).toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3));
                const bWords = new Set((b.name + ' ' + b.description).toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3));
                const common = [...aWords].filter(w => bWords.has(w));
                if (common.length >= 2) {
                    links.push({ source: a.id, target: b.id, type: 'keyword' });
                }
            }
        }
    }

    return { nodes, links };
}

function computeStats(wikiKeys, rawKeys) {
    const rawTotal = rawKeys.filter(k => !k.key_name.includes('::done')).length;
    const rawCompiled = rawKeys.filter(k => k.key_name.includes('::done')).length;
    const rawUncompiled = rawTotal - rawCompiled;

    const contributors = new Set();
    let compiled = 0, derived = 0, curated = 0;
    for (const key of wikiKeys) {
        const meta = parseDescription(key.description);
        contributors.add(meta.creator);
        if (meta.type === 'compiled') compiled++;
        else if (meta.type === 'derived') derived++;
        else if (meta.type === 'curated') curated++;
    }

    return {
        articles: wikiKeys.length,
        compiled,
        derived,
        curated,
        rawTotal,
        rawUncompiled,
        contributors: contributors.size,
        contributorNames: [...contributors],
    };
}

function generateHtml(tree, graph, stats, hypergraphEdgeCount) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Open Agent Wiki</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script src="https://d3js.org/d3.v7.min.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #05051a;
            min-height: 100vh;
            overflow: hidden;
        }
        .bg-gradient {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background:
                radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.05) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }
        header {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 20px;
            display: flex;
            align-items: center;
            gap: 28px;
            z-index: 100;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            font-size: 1.1rem;
            font-weight: 600;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .tabs {
            display: flex;
            gap: 4px;
            background: rgba(255, 255, 255, 0.03);
            padding: 4px;
            border-radius: 12px;
        }
        .tab {
            padding: 8px 16px;
            border: none;
            background: transparent;
            color: rgba(255, 255, 255, 0.5);
            font-size: 13px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s ease;
        }
        .tab:hover { color: rgba(255, 255, 255, 0.8); }
        .tab.active { background: rgba(255, 255, 255, 0.1); color: #fff; }
        .stats {
            display: flex;
            gap: 20px;
        }
        .stat { text-align: center; }
        .stat-value {
            font-size: 1.3rem;
            font-weight: 700;
            background: linear-gradient(135deg, #34d399, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .stat-label {
            font-size: 0.55rem;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 2px;
        }
        .view {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 1;
        }
        .view.active { opacity: 1; pointer-events: auto; }

        /* Tree View */
        #tree-view {
            padding: 100px 60px 60px 60px;
            overflow: auto;
        }
        #tree-view::-webkit-scrollbar { width: 8px; }
        #tree-view::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        #tree-view::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .node-row {
            display: flex;
            align-items: center;
            padding: 8px 14px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 12px;
            margin: 2px 0;
        }
        .node-row:hover { background: rgba(255,255,255,0.04); }
        .node-row.leaf:hover {
            background: rgba(52, 211, 153, 0.08);
            box-shadow: 0 0 20px rgba(52, 211, 153, 0.1);
        }
        .node-icon {
            width: 32px; height: 32px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.2s ease;
        }
        .node-row:hover .node-icon { transform: scale(1.05); }
        .node-icon.root { background: linear-gradient(135deg, #818cf8, #c084fc); }
        .node-icon.topic { background: linear-gradient(135deg, #06b6d4, #22d3ee); }
        .node-icon.compiled { background: linear-gradient(135deg, #10b981, #34d399); }
        .node-icon.derived { background: linear-gradient(135deg, #6366f1, #818cf8); }
        .node-icon.curated { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
        .node-label { font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; }
        .node-description { font-size: 12px; color: rgba(255,255,255,0.35); margin-left: 8px; flex: 1; }
        .node-badge {
            font-size: 9px;
            padding: 3px 8px;
            border-radius: 20px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .badge-compiled { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .badge-derived { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
        .badge-curated { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .node-creator {
            font-size: 10px;
            color: rgba(255,255,255,0.3);
            font-family: 'JetBrains Mono', monospace;
        }
        .node-count {
            font-size: 10px;
            color: rgba(255,255,255,0.3);
            padding: 4px 10px;
            background: rgba(255,255,255,0.04);
            border-radius: 20px;
            margin-left: auto;
        }
        .children {
            margin-left: 44px;
            border-left: 1px solid rgba(255,255,255,0.06);
            padding-left: 24px;
        }
        .toggle {
            width: 20px; height: 20px; border-radius: 6px;
            background: rgba(255,255,255,0.06);
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; color: rgba(255,255,255,0.4);
            flex-shrink: 0; transition: all 0.2s ease;
        }
        .toggle:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
        .toggle.expanded { transform: rotate(90deg); }
        .leaf .toggle { visibility: hidden; }
        .level-0 > .node-row .node-label { font-size: 22px; font-weight: 700; }
        .level-1 > .node-row .node-label { font-size: 17px; font-weight: 600; }
        .level-0 > .node-row .node-icon { width: 40px; height: 40px; font-size: 20px; }
        .level-1 > .node-row .node-icon { width: 36px; height: 36px; font-size: 17px; }
        .level-1 > .children { margin-left: 50px; }

        /* Graph View */
        #graph-view svg { width: 100%; height: 100%; }
        .graph-label {
            font-family: 'Inter', sans-serif;
            fill: rgba(255, 255, 255, 0.9);
            pointer-events: none;
            font-weight: 500;
            font-size: 10px;
        }
        .graph-label.topic-label { font-size: 13px; font-weight: 700; fill: #fff; }
        .link { stroke-linecap: round; }

        /* Detail panel */
        .detail-panel {
            position: fixed;
            top: 100px;
            right: 28px;
            width: 400px;
            max-height: calc(100vh - 140px);
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px;
            padding: 24px;
            z-index: 100;
            overflow-y: auto;
            display: none;
            color: rgba(255,255,255,0.85);
            font-size: 13px;
            line-height: 1.6;
        }
        .detail-panel::-webkit-scrollbar { width: 6px; }
        .detail-panel::-webkit-scrollbar-track { background: transparent; }
        .detail-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .detail-panel.visible { display: block; }
        .detail-panel h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
            color: #fff;
        }
        .detail-meta {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }
        .detail-content {
            white-space: pre-wrap;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            color: rgba(255,255,255,0.7);
            background: rgba(0,0,0,0.3);
            padding: 16px;
            border-radius: 10px;
            max-height: 400px;
            overflow-y: auto;
        }
        .detail-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: rgba(255,255,255,0.06);
            border: none;
            color: rgba(255,255,255,0.5);
            width: 28px;
            height: 28px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .detail-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

        /* Search */
        .search-box {
            position: fixed;
            top: 100px;
            left: 28px;
            z-index: 100;
        }
        .search-box input {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #fff;
            padding: 14px 20px;
            border-radius: 14px;
            font-size: 13px;
            font-family: inherit;
            width: 260px;
            outline: none;
            backdrop-filter: blur(20px);
            transition: all 0.2s ease;
        }
        .search-box input::placeholder { color: rgba(255, 255, 255, 0.3); }
        .search-box input:focus {
            border-color: rgba(129, 140, 248, 0.5);
            box-shadow: 0 0 20px rgba(129, 140, 248, 0.15);
        }

        /* Legend */
        .legend {
            position: fixed;
            bottom: 28px;
            left: 28px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            z-index: 100;
        }
        .legend-title {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            font-weight: 600;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        }
        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .legend-note {
            font-size: 10px;
            color: rgba(255,255,255,0.3);
            margin-top: 4px;
            font-style: italic;
        }

        /* Empty state */
        .empty-state {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 10;
        }
        .empty-state h2 {
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 12px;
        }
        .empty-state p {
            color: rgba(255,255,255,0.5);
            font-size: 14px;
            line-height: 1.8;
        }
        .empty-state code {
            background: rgba(255,255,255,0.06);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            color: #34d399;
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>

    <header>
        <h1>Open Agent Wiki</h1>
        <div class="tabs">
            <button class="tab active" onclick="switchView('tree')">Tree</button>
            <button class="tab" onclick="switchView('graph')">Graph</button>
        </div>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${stats.articles}</div>
                <div class="stat-label">Articles</div>
            </div>
            <div class="stat">
                <div class="stat-value">${stats.contributors}</div>
                <div class="stat-label">Contributors</div>
            </div>
            <div class="stat">
                <div class="stat-value">${stats.rawUncompiled}</div>
                <div class="stat-label">Uncompiled</div>
            </div>
            <div class="stat">
                <div class="stat-value">${hypergraphEdgeCount}</div>
                <div class="stat-label">Connections</div>
            </div>
        </div>
    </header>

    <div class="search-box">
        <input type="text" placeholder="Search articles..." id="search" oninput="handleSearch(this.value)">
    </div>

    <div id="tree-view" class="view active"></div>
    <div id="graph-view" class="view"></div>

    <div class="detail-panel" id="detail-panel">
        <button class="detail-close" onclick="closeDetail()">&times;</button>
        <h2 id="detail-title"></h2>
        <div class="detail-meta" id="detail-meta"></div>
        <div class="detail-content" id="detail-content"></div>
    </div>

    <div class="legend">
        <div class="legend-title">Entry Types</div>
        <div class="legend-item">
            <div class="legend-color" style="background: #34d399;"></div>
            Compiled (from source)
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #818cf8;"></div>
            Derived (from research)
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #fbbf24;"></div>
            Curated (human-written)
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #22d3ee;"></div>
            Topic cluster
        </div>
        <div class="legend-note">Node size = hypergraph centrality</div>
    </div>

    <script>
    const treeData = ${JSON.stringify(tree)};
    const graphData = ${JSON.stringify(graph)};
    const stats = ${JSON.stringify(stats)};

    // --- View switching ---
    function switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById(view + '-view').classList.add('active');
        event.target.classList.add('active');
        if (view === 'graph' && !window.graphInitialized) initGraph();
    }

    // --- Detail panel ---
    function showDetail(name, type, creator, version, content) {
        const panel = document.getElementById('detail-panel');
        document.getElementById('detail-title').textContent = name;
        const meta = document.getElementById('detail-meta');
        const badgeClass = 'badge-' + type;
        meta.innerHTML =
            '<span class="node-badge ' + badgeClass + '">' + type + '</span>' +
            '<span class="node-creator">by ' + creator + '</span>' +
            (version > 1 ? '<span class="node-creator">v' + version + '</span>' : '');
        document.getElementById('detail-content').textContent = content || '(no content loaded)';
        panel.classList.add('visible');
    }
    function closeDetail() {
        document.getElementById('detail-panel').classList.remove('visible');
    }

    // --- Tree View ---
    function renderTree() {
        const container = document.getElementById('tree-view');
        if (!treeData.children || treeData.children.length === 0) {
            container.innerHTML = \`
                <div class="empty-state">
                    <h2>Wiki is empty</h2>
                    <p>Start contributing with <code>/ingest &lt;url&gt;</code><br>
                    or run <code>/compile</code> to process raw sources.</p>
                </div>\`;
            return;
        }
        container.innerHTML = renderNode(treeData, 0);
    }

    function renderNode(node, level) {
        const isLeaf = !node.children || node.children.length === 0;
        const type = node.type || node.entryType || 'compiled';
        const iconClass = isLeaf ? type : node.type;
        const leafClass = isLeaf ? 'leaf' : '';

        let badges = '';
        if (isLeaf && node.type) {
            badges += '<span class="node-badge badge-' + (node.type || 'compiled') + '">' + (node.type || 'compiled') + '</span>';
        }
        if (isLeaf && node.creator) {
            badges += '<span class="node-creator">by ' + node.creator + '</span>';
        }
        if (isLeaf && node.version > 1) {
            badges += '<span class="node-creator">v' + node.version + '</span>';
        }

        const countBadge = !isLeaf && node.children ? '<span class="node-count">' + node.children.length + '</span>' : '';
        const desc = node.description ? '<span class="node-description">' + node.description + '</span>' : '';
        const clickHandler = isLeaf
            ? ' onclick="showDetail(\'' + esc(node.name) + "', '" + esc(node.type || 'compiled') + "', '" + esc(node.creator || 'unknown') + "', " + (node.version || 1) + ", " + 'treeData' + ')"'
            : ' onclick="toggleNode(this)"';

        // For leaf nodes, attach content via data attribute
        const dataContent = isLeaf ? ' data-content="' + escAttr(node.content || '') + '"' : '';

        let html = '<div class="branch level-' + level + '" data-name="' + esc(node.name) + '">';
        html += '<div class="node-row ' + leafClass + '"' + dataContent + (isLeaf ? ' onclick="showDetailFromEl(this)"' : ' onclick="toggleNode(this)"') + '>';
        html += '<div class="toggle' + (level === 0 ? ' expanded' : '') + '">&#9654;</div>';
        html += '<div class="node-icon ' + iconClass + '">' + (node.icon || '') + '</div>';
        html += '<span class="node-label">' + node.name + '</span>';
        html += desc + badges + countBadge;
        html += '</div>';

        if (!isLeaf && node.children) {
            html += '<div class="children"' + (level === 0 ? '' : ' style="display:none"') + '>';
            for (const child of node.children) {
                html += renderNode(child, level + 1);
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function esc(s) { return (s || '').replace(/'/g, "\\\\'").replace(/"/g, '&quot;'); }
    function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function showDetailFromEl(el) {
        const branch = el.closest('.branch');
        const name = branch?.dataset.name || '';
        const badges = el.querySelectorAll('.node-badge');
        const type = badges[0]?.textContent || 'compiled';
        const creatorEl = el.querySelector('.node-creator');
        const creator = creatorEl?.textContent?.replace('by ', '') || 'unknown';
        const content = el.dataset.content || '(no content)';
        const versionEl = [...el.querySelectorAll('.node-creator')].find(e => e.textContent.startsWith('v'));
        const version = versionEl ? parseInt(versionEl.textContent.slice(1)) : 1;
        showDetail(name, type, creator, version, content);
    }

    function toggleNode(el) {
        const children = el.nextElementSibling;
        const toggle = el.querySelector('.toggle');
        if (children && children.classList.contains('children')) {
            const visible = children.style.display !== 'none';
            children.style.display = visible ? 'none' : 'block';
            toggle?.classList.toggle('expanded', !visible);
        }
    }

    function handleSearch(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.branch').forEach(branch => {
            const name = (branch.dataset.name || '').toLowerCase();
            const match = !q || name.includes(q);
            branch.style.display = match ? '' : 'none';
            if (match && q) {
                // expand parents
                let parent = branch.parentElement;
                while (parent) {
                    if (parent.classList?.contains('children')) parent.style.display = 'block';
                    parent = parent.parentElement;
                }
            }
        });
    }

    // --- Graph View ---
    window.graphInitialized = false;
    function initGraph() {
        window.graphInitialized = true;
        const container = document.getElementById('graph-view');
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (graphData.nodes.length === 0) {
            container.innerHTML = \`
                <div class="empty-state">
                    <h2>Wiki is empty</h2>
                    <p>Start contributing with <code>/ingest &lt;url&gt;</code></p>
                </div>\`;
            return;
        }

        const svg = d3.select('#graph-view').append('svg')
            .attr('width', width).attr('height', height);

        // Glow filter
        const defs = svg.append('defs');
        const filter = defs.append('filter').attr('id', 'glow');
        filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        const g = svg.append('g');

        // Zoom
        svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', (e) => {
            g.attr('transform', e.transform);
        }));

        const typeColors = {
            topic: '#22d3ee',
            compiled: '#34d399',
            derived: '#818cf8',
            curated: '#fbbf24',
        };

        function getNodeColor(d) {
            if (d.type === 'topic') return typeColors.topic;
            return typeColors[d.entryType] || typeColors.compiled;
        }

        const simulation = d3.forceSimulation(graphData.nodes)
            .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(d =>
                d.type === 'hierarchy' ? 80 : 150
            ))
            .force('charge', d3.forceManyBody().strength(d => d.type === 'topic' ? -400 : -120))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.size + 5));

        const link = g.append('g').selectAll('line')
            .data(graphData.links).join('line')
            .attr('class', 'link')
            .attr('stroke', d => d.type === 'hierarchy' ? 'rgba(255,255,255,0.08)' :
                d.type === 'hypergraph' ? 'rgba(129,140,248,0.25)' : 'rgba(52,211,153,0.15)')
            .attr('stroke-width', d => d.type === 'hierarchy' ? 1 : 1.5)
            .attr('stroke-dasharray', d => d.type === 'hypergraph' ? '6,4' : d.type === 'keyword' ? '3,3' : 'none');

        const node = g.append('g').selectAll('g')
            .data(graphData.nodes).join('g')
            .call(d3.drag()
                .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
            );

        node.append('circle')
            .attr('r', d => d.size)
            .attr('fill', d => getNodeColor(d))
            .attr('opacity', 0.85)
            .style('filter', 'url(#glow)')
            .style('cursor', 'pointer')
            .on('click', (e, d) => {
                if (d.type !== 'topic') {
                    showDetail(d.name, d.entryType || 'compiled', d.creator || 'unknown', d.version || 1, d.content || '');
                }
            });

        node.append('text')
            .attr('class', d => 'graph-label' + (d.type === 'topic' ? ' topic-label' : ''))
            .attr('dy', d => d.size + 14)
            .attr('text-anchor', 'middle')
            .text(d => d.name);

        // Tooltip with creator on hover
        node.append('title')
            .text(d => {
                if (d.type === 'topic') return d.name;
                return d.name + ' (by ' + (d.creator || 'unknown') + ', ' + (d.entryType || 'compiled') + ')';
            });

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
        });
    }

    // Init
    renderTree();
    </script>
</body>
</html>`;
}

async function main() {
    console.log('Open Agent Wiki — Generating visualization\\n');

    const [wikiKeys, rawKeys] = await Promise.all([
        fetchKeys('wiki/'),
        fetchKeys('raw/'),
    ]);

    const latestWikiKeys = getLatestVersions(wikiKeys);
    console.log(`Found ${latestWikiKeys.length} wiki articles (latest versions)`);

    const contents = await fetchContent(latestWikiKeys.map(k => ({ key_name: k.originalKey })));
    const hypergraph = await fetchHypergraph();
    console.log(`Hypergraph: ${hypergraph.nodes.length} nodes, ${hypergraph.edges.length} edges`);

    const tree = buildTree(latestWikiKeys, contents);
    const graph = buildGraph(latestWikiKeys, contents, hypergraph);
    const stats = computeStats(latestWikiKeys, rawKeys);

    const html = generateHtml(tree, graph, stats, hypergraph.edges.length);
    const outputPath = join(PLUGIN_ROOT, 'wiki-viz.html');
    writeFileSync(outputPath, html);
    console.log(`\\nVisualization written to ${outputPath}`);

    console.log(`\\nStats:`);
    console.log(`  Articles: ${stats.articles} (${stats.compiled} compiled, ${stats.derived} derived, ${stats.curated} curated)`);
    console.log(`  Raw sources: ${stats.rawTotal} (${stats.rawUncompiled} uncompiled)`);
    console.log(`  Contributors: ${stats.contributors} (${stats.contributorNames.join(', ')})`);
    console.log(`  Hypergraph connections: ${hypergraph.edges.length}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
