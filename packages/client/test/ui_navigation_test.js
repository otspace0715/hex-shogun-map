import { test, expect, describe, beforeEach } from "vitest";

describe("Hex-Shogun-Simulation-Logic", () => {
  // グローバル環境のモック設定
  beforeEach(() => {
    global.window = {
      location: { href: "http://localhost/index.html?mode=world" },
    };
    global.SIM_STATE = { year: 1580, season: "summer" };
    global.localStorage = { setItem: (k, v) => {} };
  });

  // --- 1. Warp Engine Logic (Mocked from map_utils.js) ---
  const warpLogic = (mode, province, id, label, seq, sources, time_delta) => {
    const targetUrl = new URL(window.location.href);
    if (mode) targetUrl.searchParams.set("mode", mode);
    if (province) targetUrl.searchParams.set("p", province);
    if (id) targetUrl.searchParams.set("id", id);
    if (label) targetUrl.searchParams.set("label", label);
    if (sources)
      targetUrl.searchParams.set(
        "s",
        Array.isArray(sources) ? sources.join(",") : sources,
      );
    else if (seq) targetUrl.searchParams.set("s", seq);

    if (time_delta) {
      if (time_delta.years) global.SIM_STATE.year += time_delta.years;
      if (time_delta.days && time_delta.days >= 365)
        global.SIM_STATE.year += Math.floor(time_delta.days / 365);
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

  test("Unified Warp & URL Params", () => {
    const urlStr = warpLogic(
      "subgrid",
      "壱岐",
      null,
      null,
      null,
      ["001", "002", "003"],
      { years: 5 },
    );
    const decodedUrl = decodeURIComponent(urlStr);

    expect(decodedUrl).toContain("s=001,002,003");
    expect(global.SIM_STATE.year).toBe(1585);
  });

  test("Multi-source Merge", () => {
    const mockData = [
      { province: "壱岐", cells: [{ id: "A" }] },
      { province: "壱岐", cells: [{ id: "B" }] },
    ];
    const merged = mergeLogic(mockData);

    expect(merged.cells).toHaveLength(2);
    expect(merged.cells[1].id).toBe("B");
  });
});
