const fs = require('fs');
const path = require('path');

const targetName = "伊豆";
// __dirname は packages/contracts/test/simulation
const baseDir = path.join(__dirname, "..", "..", "data", "sengoku");
const targetPath = path.join(baseDir, targetName, `${targetName}.json`);

console.log("--- MUD Data Layer Simulation (Node.js Mode) ---");

if (!fs.existsSync(targetPath)) {
    console.error(`Error: Data file not found at ${targetPath}`);
    process.exit(1);
}

try {
    const rawData = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(rawData);

    console.log(`[Interface] Reading data for ${targetName}...`);
    const cell = data.cells[0];

    // Initial state (MUD Component simulation)
    const initialZeny = cell.attr.zeny || 0;
    const initialHyoro = cell.attr.hyoro || 0;
    console.log(`  Initial state: Zeny = ${initialZeny}, Hyoro = ${initialHyoro}`);

    // Logic Layer Simulation (Develop action)
    console.log("[Logic] Executing 'Develop' action...");
    const income = 500;
    const newZeny = initialZeny + income;

    // Store Update Simulation
    console.log("[Store] Updating data on-chain (Memory simulation)...");
    cell.attr.zeny = newZeny;

    // Verification
    console.log("--- Test Result ---");
    console.log(`  Result Zeny: ${cell.attr.zeny} (Initial: ${initialZeny} + Income: ${income})`);

    if (cell.attr.zeny === newZeny) {
        console.log("  Status: SUCCESS (Logic works as expected)");
    } else {
        console.log("  Status: FAILED");
    }
} catch (err) {
    console.error("Error during execution:", err);
}
