const canvas = document.getElementById('cv-sub');
const ctx = canvas.getContext('2d');
const HEX_R = 40; // Tactical scale is larger
let subgridData = null;
let spawnCell = null;

async function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const params = new URLSearchParams(window.location.search);
    const provinceName = params.get('p') || '壱岐';
    const seq = params.get('s') || '1';

    try {
        // Generate filename: e.g., data/壱岐/壱岐_sub_001.json
        const paddedSeq = `000${seq}`.slice(-3);
        const response = await fetch(`data/${provinceName}/${provinceName}_sub_${paddedSeq}.json`);

        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        subgridData = await response.json();
        document.getElementById('subgrid-title').innerText = `${subgridData.province} - ${subgridData.sector_info || '戦術エリア'}`;

        spawnRandomly();
        render();
    } catch (e) {
        console.error(e);
        document.getElementById('subgrid-title').innerText = "エラー: データの読み込みに失敗しました";
    }
}

function spawnRandomly() {
    const cells = subgridData.cells;
    const idx = Math.floor(Math.random() * cells.length);
    spawnCell = cells[idx];

    const msg = document.getElementById('spawn-msg');
    msg.innerText = `[${spawnCell.cell_id}] にスポーンしました！`;
    msg.style.display = 'block';
    setTimeout(() => msg.style.opacity = '0', 3000);
}

// Simple Flat-top hex math
function getCoords(q, r) {
    const x = HEX_R * 1.5 * q + (canvas.width / 2 - 200);
    const y = HEX_R * Math.sqrt(3) * (r + q / 2) + (canvas.height / 2 - 200);
    return { x, y };
}

function drawHex(cx, cy, cell) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = cx + HEX_R * Math.cos(angle);
        const y = cy + HEX_R * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = cell.poi ? 'gold' : (cell.terrain.type === 'coast' ? '#1a3a5c' : '#3d5a3e');
    ctx.fill();
    ctx.strokeStyle = (spawnCell && cell.cell_id === spawnCell.cell_id) ? 'red' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = (spawnCell && cell.cell_id === spawnCell.cell_id) ? 3 : 1;
    ctx.stroke();

    if (cell.poi) {
        ctx.fillStyle = 'black';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cell.poi.name, cx, cy + 5);
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    subgridData.cells.forEach(cell => {
        const { x, y } = getCoords(cell.coordinate.q, cell.coordinate.r);
        drawHex(x, y, cell);
    });
}

init();
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
});
