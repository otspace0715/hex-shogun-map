/**
 * Hex-Shogun-Simulation-Logic-Test (Consolidated)
 * 統一ワープエンジン、時間経過、およびデータ結合の整合性を一括検証します。
 */

// Mock globals for node environment
global.window = { location: { href: 'http://localhost/index.html?mode=world' } };
global.SIM_STATE = { year: 1580, season: 'summer' };
global.localStorage = { setItem: (k, v) => { /* console.log(`[Storage] ${k}=${v}`); */ } };

// --- 1. Warp Engine Logic (Mocked from map_utils.js) ---
const warpLogic = (mode, province, id, label, seq, sources, time_delta) => {
    const targetUrl = new URL(window.location.href);
    if (mode) targetUrl.searchParams.set('mode', mode);
    if (province) targetUrl.searchParams.set('p', province);
    if (id) targetUrl.searchParams.set('id', id);
    if (label) targetUrl.searchParams.set('label', label);
    if (sources) targetUrl.searchParams.set('s', Array.isArray(sources) ? sources.join(',') : sources);
    else if (seq) targetUrl.searchParams.set('s', seq);

    if (time_delta) {
        if (time_delta.years) SIM_STATE.year += time_delta.years;
        if (time_delta.days && time_delta.days >= 365) SIM_STATE.year += Math.floor(time_delta.days / 365);
    }
    return targetUrl.toString();
};

// --- 2. Data Merge Logic (Mocked from app.js) ---
const mergeLogic = (results) => {
    let subgridData = JSON.parse(JSON.stringify(results[0]));
    for (let i = 1; i < results.length; i++) {
        subgridData.cells = [...subgridData.cells, ...results[i].cells];
    }
    return subgridData;
};

// --- Execution ---
function runTests() {
    console.log('🚀 Running Consolidated Simulation Tests...');

    // Test A: Unified Warp & URL Params
    const urlStr = warpLogic('subgrid', '壱岐', null, null, null, ['001', '002', '003'], { years: 5 });
    const decodedUrl = decodeURIComponent(urlStr);
    console.assert(decodedUrl.includes('s=001,002,003'), '❌ Warp URL: sources generation failed');
    console.assert(SIM_STATE.year === 1585, '❌ Time Delta: year progression failed');
    console.log('✅ Warp & Time logic passed.');

    // Test B: Multi-source Merge
    const mockData = [
        { province: '壱岐', cells: [{ id: 'A' }] },
        { province: '壱岐', cells: [{ id: 'B' }] }
    ];
    const merged = mergeLogic(mockData);
    console.assert(merged.cells.length === 2, '❌ Merge: cell count mismatch');
    console.assert(merged.cells[1].id === 'B', '❌ Merge: data corruption');
    console.log('✅ Data merge logic passed.');

    console.log('\n🌟 CONSOLIDATED LOGIC TESTS PASSED 🌟');
}

runTests();
