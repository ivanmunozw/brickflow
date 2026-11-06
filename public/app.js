const normalizeSearchText = value => value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const weekdayNames = new Map([['domingo', 0], ['lunes', 1], ['martes', 2], ['miercoles', 3], ['jueves', 4], ['viernes', 5], ['sabado', 6]]);

function getRowDate(row) {
    if (row.dataset.date) {
        const [year, month, day] = row.dataset.date.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    const parts = row.cells[0]?.textContent.trim().split(/[/.\-]/).map(Number);
    if (!parts || parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const [day, month, year] = parts;
    return new Date(year, month - 1, day);
}

function getRequestedDate(question) {
    const requested = { day: null, month: null, year: null, weekday: null, start: null, end: null };
    const today = new Date();

    if (/\bhoy\b/.test(question)) {
        requested.day = today.getDate();
        requested.month = today.getMonth() + 1;
        requested.year = today.getFullYear();
    } else if (/\bayer\b/.test(question) || /\banoche\b/.test(question)) {
        today.setDate(today.getDate() - 1);
        requested.day = today.getDate();
        requested.month = today.getMonth() + 1;
        requested.year = today.getFullYear();
    } else if (/\banteayer\b/.test(question)) {
        today.setDate(today.getDate() - 2);
        requested.day = today.getDate();
        requested.month = today.getMonth() + 1;
        requested.year = today.getFullYear();
    }

    if (/\b(esta semana|semana actual)\b/.test(question)) {
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        requested.start = start;
        requested.end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    } else if (/\b(semana pasada|la semana anterior|ultima semana)\b/.test(question)) {
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7);
        requested.start = start;
        requested.end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    } else if (/\b(este mes|mes actual)\b/.test(question)) {
        requested.start = new Date(today.getFullYear(), today.getMonth(), 1);
        requested.end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    } else if (/\b(mes pasado|el mes anterior)\b/.test(question)) {
        requested.start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        requested.end = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (/\b(este ano|ano actual)\b/.test(question)) {
        requested.start = new Date(today.getFullYear(), 0, 1);
        requested.end = new Date(today.getFullYear() + 1, 0, 1);
    }

    const numericDate = question.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    if (numericDate) {
        requested.day = Number(numericDate[1]);
        requested.month = Number(numericDate[2]);
        requested.year = numericDate[3] ? Number(numericDate[3]) : requested.year;
        if (requested.year && requested.year < 100) requested.year += 2000;
    } else {
        const month = monthNames.find(name => new RegExp(`\\b${name}\\b`).test(question));
        if (month) {
            requested.month = monthNames.indexOf(month) + 1;
            const dayBeforeMonth = question.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?${month}\\b`));
            if (dayBeforeMonth) requested.day = Number(dayBeforeMonth[1]);
            const yearAfterMonth = question.match(new RegExp(`\\b${month}\\s+(?:del?\\s+)?(\\d{4})\\b`));
            if (yearAfterMonth) requested.year = Number(yearAfterMonth[1]);
        }
        const dayOnly = question.match(/\bdia\s+(\d{1,2})\b/);
        if (dayOnly) requested.day = Number(dayOnly[1]);
    }

    for (const [weekday, index] of weekdayNames) {
        if (new RegExp(`\\b${weekday}\\b`).test(question)) requested.weekday = index;
    }

    return requested;
}

function getProductionQuestionAnswer(rawQuestion, rows) {
    const question = normalizeSearchText(rawQuestion);
    const requestedDate = getRequestedDate(question);
    const dateWasRequested = Object.values(requestedDate).some(value => value !== null);
    const allCells = rows.map(row => Array.from(row.cells).map(cell => normalizeSearchText(cell.textContent.trim())));
    const operators = [...new Set(allCells.map(cells => cells[1]).filter(Boolean))].sort((a, b) => b.length - a.length);
    const products = [...new Set(allCells.map(cells => cells[2]).filter(Boolean))].sort((a, b) => b.length - a.length);
    const operator = operators.find(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(question));
    const product = products.find(name => {
        const primaryName = name.split('(')[0].trim();
        const productWords = primaryName.split(/\s+/).filter(word => !['ladrillo', 'bloque', 'de', 'concreto'].includes(word) && word.length > 2);
        return question.includes(name) || (productWords.length > 0 && productWords.every(word => new RegExp(`\\b${word}\\b`).test(question)));
    });
    const stopWords = new Set([
        'cuanto', 'cuanta', 'cuantos', 'cuantas', 'produccion', 'produjo', 'producir', 'fabricacion', 'fabrico',
        'fabricar', 'fabricados', 'hecho', 'hicieron', 'salieron', 'salida', 'trabajo', 'hizo', 'hubo', 'registro',
        'registrado', 'registros', 'obrero', 'obreros', 'operario', 'operarios', 'trabajador', 'trabajadores',
        'ladrillo', 'ladrillos', 'bloque', 'bloques', 'pieza', 'piezas', 'cantidad', 'dia', 'dias', 'el', 'la',
        'los', 'las', 'de', 'del', 'en', 'un', 'una', 'que', 'sobre', 'para', 'por', 'durante', 'este', 'esta',
        'hoy', 'ayer', 'anoche', 'anteayer', 'total', 'promedio', 'media', 'mas', 'menos', 'fue', 'todos', 'todas', 'todo', 'toda',
        'llamado', 'llamada', 'nombre', 'semana', 'actual', 'pasada', 'anterior', 'ultima', 'mes', 'ano',
        'es', 'son', 'cuál', 'cual', 'dime', 'muestra', 'indica', 'informa', 'hubieron', 'se', 'ha', 'han',
        'merma', 'mermas', 'porcentaje', 'danados', 'danadas', 'eficiencia', 'neto', 'neta', 'lote', 'lotes', 'tasa',
        ...monthNames,
        ...weekdayNames.keys()
    ]);
    let requestedOperator = operator || null;

    if (!requestedOperator) {
        const workerPatterns = [
            /\b(?:llamado|llamada|de nombre)\s+([a-z]+)/,
            /\b(?:operario|obrero|trabajador)\s+(?:el|la)?\s*([a-z]+)/,
            /\b(?:de|del|para|por|produjo|producir|fabrico|hizo|trabajo|registro)\s+(?:el|la)?\s*([a-z]+)/
        ];
        const operatorWords = new Set(operators.flatMap(name => name.split(/\s+/)));
        const candidates = workerPatterns
            .flatMap(pattern => [...question.matchAll(new RegExp(pattern.source, 'g'))].map(match => match[1]))
            .filter(candidate => candidate && !stopWords.has(candidate) && !products.some(name => name.includes(candidate)));
        requestedOperator = candidates.find(candidate => operatorWords.has(candidate)) || candidates[0] || null;
    }

    const topicWords = /\b(produccion|produjo|produjeron|producir|salieron|sacaron|fabricacion|fabrico|fabricar|hizo|hicieron|ladrillo|ladrillos|bloque|bloques|pieza|piezas|merma|danad|eficiencia|registro|lote|hornada|operario|obrero|trabajador|total|promedio|media|cantidad|cuanto|cuanta|cuantos|cuantas|porcentaje|por\s+ciento|porciento|neto|util|bueno|rendimiento)\b/.test(question);
    if (!topicWords && !requestedOperator && !product && !dateWasRequested) {
        return 'No entendí qué dato de producción buscas. Prueba preguntando por producción, piezas dañadas, merma, un operario o una fecha.';
    }

    const dateWords = new Set(['hoy', 'ayer', 'anoche', 'anteayer', ...monthNames, ...weekdayNames.keys()]);
    const hasDate = dateWasRequested;
    const filteredRows = rows.filter((row, index) => {
        const cells = allCells[index];
        if (requestedOperator && !cells[1]?.includes(requestedOperator)) return false;
        if (product && !cells[2]?.includes(product)) return false;
        if (hasDate) {
            const date = getRowDate(row);
            if (!date || Number.isNaN(date.getTime())) return false;
            if (requestedDate.day !== null && date.getDate() !== requestedDate.day) return false;
            if (requestedDate.month !== null && date.getMonth() + 1 !== requestedDate.month) return false;
            if (requestedDate.year !== null && date.getFullYear() !== requestedDate.year) return false;
            if (requestedDate.weekday !== null && date.getDay() !== requestedDate.weekday) return false;
            if (requestedDate.start && (date < requestedDate.start || date >= requestedDate.end)) return false;
        }
        return true;
    });

    if (!filteredRows.length) return 'No se encontró información para esos criterios en los registros de producción.';

    const asksDamaged = /\b(danad|rot|defect|merma|desperdicio|perdid|romp|quebrad|fallad)\w*\b/.test(question);
    const asksWasteRate = asksDamaged && /\b(porcentaje|por\s+ciento|porciento|tasa|proporcion|%)\b/.test(question);
    const asksNet = /\b(neto|neta|util|utiles|bueno|buenos|aprovechable|aprovechables|sin\s+danos|real)\b/.test(question);
    const asksCount = /\b(numero|registros|lotes|veces|turnos)\b/.test(question) || /\bcantidad\s+de\s+(?:registros|lotes|turnos)\b/.test(question);
    const asksWorkerCount = /\b(cuantos|cuantas|numero|cantidad)\b/.test(question) && /\b(operarios|obreros|trabajadores)\b/.test(question);
    const asksAverage = /\b(promedio|media|promedio|diario|por\s+dia)\b/.test(question);
    const asksMaximum = /\b(mas|mayor|maximo|maxima|mejor)\b/.test(question);
    const asksMinimum = /\b(menos|menor|minimo|minima)\b/.test(question);
    const asksEfficiency = /\b(eficiencia|clasificacion|categoria|calidad)\b/.test(question);
    const asksRanking = /\b(quien|que\s+operario|que\s+obrero)\b/.test(question) && (asksMaximum || asksMinimum);
    const asksMetric = asksDamaged || asksNet || asksCount || asksAverage || asksMaximum || asksMinimum || /\b(produccion|produjo|produjeron|producir|salieron|sacaron|fabricacion|fabrico|fabricar|fabricados|hizo|hicieron|ladrillo|ladrillos|bloque|bloques|pieza|piezas|cuanto|cuanta|cuantos|cuantas|total|merma|porcentaje|eficiencia|danad|registro|lote)\b/.test(question);

    const valuesForRow = row => {
        const molded = Number(row.cells[3]?.textContent.replace(/[^\d.-]/g, '')) || 0;
        const damaged = Number(row.cells[4]?.textContent.replace(/[^\d.-]/g, '')) || 0;
        return { molded, damaged, net: molded - damaged };
    };
    const formatNumber = value => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);

    if ((asksMaximum || asksMinimum) && !asksRanking && !requestedOperator && !product) {
        const metric = asksDamaged ? 'damaged' : asksNet ? 'net' : 'molded';
        const rankedRows = filteredRows
            .map(row => ({ row, value: valuesForRow(row)[metric] }))
            .sort((a, b) => asksMinimum ? a.value - b.value : b.value - a.value);
        const best = rankedRows[0];
        const label = asksDamaged ? 'piezas dañadas' : asksNet ? 'piezas netas' : 'piezas fabricadas';
        return `${asksMinimum ? 'Mínimo' : 'Máximo'}: ${formatNumber(best.value)} ${label}, registrado por ${best.row.cells[1]?.textContent.trim() || 'operario sin nombre'} el ${best.row.cells[0]?.textContent.trim() || 'fecha desconocida'}.`;
    }

    if (asksRanking) {
        const totals = new Map();
        for (const row of filteredRows) {
            const name = row.cells[1]?.textContent.trim() || 'Sin nombre';
            const values = valuesForRow(row);
            const amount = asksDamaged ? values.damaged : asksNet ? values.net : values.molded;
            totals.set(name, (totals.get(name) || 0) + amount);
        }
        const ranked = [...totals.entries()].sort((a, b) => asksMinimum ? a[1] - b[1] : b[1] - a[1]);
        return `${ranked[0][0]} ${asksMinimum ? 'registró la menor' : 'registró la mayor'} producción: ${formatNumber(ranked[0][1])} ladrillos.`;
    }

    if (asksWorkerCount) {
        const workerCount = new Set(filteredRows.map(row => normalizeSearchText(row.cells[1]?.textContent.trim() || '')).filter(Boolean)).size;
        return `Hay ${workerCount} ${workerCount === 1 ? 'operario' : 'operarios'} con producción registrada.`;
    }

    if (asksEfficiency) {
        return filteredRows.map(row => {
            const operatorName = row.cells[1]?.textContent.trim() || 'Operario sin nombre';
            const efficiency = row.cells[5]?.textContent.trim() || 'Sin clasificación';
            const date = row.cells[0]?.textContent.trim() || 'fecha desconocida';
            return `${operatorName}: ${efficiency} (${date})`;
        }).join(' · ');
    }

    if (asksMetric) {
        const totals = filteredRows.reduce((sum, row) => {
            const values = valuesForRow(row);
            sum.molded += values.molded;
            sum.damaged += values.damaged;
            sum.net += values.net;
            return sum;
        }, { molded: 0, damaged: 0, net: 0 });

        if (asksCount) return `Se encontraron ${filteredRows.length} ${filteredRows.length === 1 ? 'registro' : 'registros'} de producción.`;
        if (asksWasteRate) {
            const percentage = totals.molded ? (totals.damaged / totals.molded) * 100 : 0;
            return `La merma fue de ${formatNumber(percentage)}% (${formatNumber(totals.damaged)} dañados de ${formatNumber(totals.molded)} fabricados).`;
        }

        const metric = asksDamaged ? 'damaged' : asksNet ? 'net' : 'molded';
        const label = metric === 'damaged' ? 'piezas dañadas' : metric === 'net' ? 'piezas netas' : 'piezas fabricadas';
        const amount = totals[metric];
        const displayedAmount = asksAverage ? amount / filteredRows.length : amount;
        const qualifier = asksAverage ? 'Promedio' : 'Total';
        return `${qualifier} de ${label}: ${formatNumber(displayedAmount)}${asksAverage ? ' por registro' : ''} (${filteredRows.length} ${filteredRows.length === 1 ? 'registro' : 'registros'}).`;
    }

    return filteredRows.map(row => Array.from(row.cells).map(cell => cell.textContent.trim()).join(' | ')).join(' · ');
}

const productionForm = document.getElementById('production-form');
const productionResult = document.getElementById('production-result');
const productionStorageKey = 'brickflow.productionRecords.v1';
const tableBody = document.getElementById('table-body');
const inventoryBody = document.getElementById('inventory-body');
const brickTypeSelect = document.getElementById('brick-type');
const productionState = {
    currency: 'USD',
    products: [],
    productionRecords: [],
    savedRecords: []
};

function getEfficiency(mermaPercentage) {
    if (mermaPercentage <= 5) return { category: 'Muy Eficiente', color: '#27ae60' };
    if (mermaPercentage <= 10) return { category: 'Eficiente', color: '#2980b9' };
    if (mermaPercentage <= 20) return { category: 'Deficiente', color: '#d35400' };
    return { category: 'Muy Deficiente', color: '#c0392b' };
}

function formatNumber(value) {
    return new Intl.NumberFormat('es').format(value);
}

function getSavedRecords() {
    const storedRecords = localStorage.getItem(productionStorageKey);
    if (storedRecords === null) return [];

    const parsedRecords = JSON.parse(storedRecords);
    if (!Array.isArray(parsedRecords)) {
        throw new Error('El historial guardado tiene un formato inválido.');
    }

    return parsedRecords;
}

function renderProductOptions(products) {
    brickTypeSelect.replaceChildren();
    for (const { id, nombre } of products) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = nombre;
        brickTypeSelect.append(option);
    }
    brickTypeSelect.disabled = products.length === 0;
}

function renderInventory(products, savedRecords) {
    inventoryBody.replaceChildren();

    for (const product of products) {
        const producedSinceLoad = savedRecords
            .filter(record => record.productId === product.id)
            .reduce((total, record) => total + record.molded - record.damaged, 0);
        const row = document.createElement('tr');
        const values = [
            product.nombre,
            product.categoria,
            new Intl.NumberFormat('es', {
                style: 'currency',
                currency: productionState.currency
            }).format(product.precioUnitario),
            `${formatNumber(product.stockDisponible + producedSinceLoad)} ${product.unidadStock}`
        ];

        for (const value of values) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        }
        inventoryBody.append(row);
    }
}

function createProductionRow(record) {
    const row = document.createElement('tr');
    row.dataset.date = record.date;
    const date = new Date(`${record.date}T00:00:00`);
    const efficiency = getEfficiency(record.mermaPercentage);
    const values = [
        date.toLocaleDateString(),
        record.operatorName,
        record.brickType,
        record.molded,
        record.damaged
    ];

    for (const [index, value] of values.entries()) {
        const cell = document.createElement('td');
        if (index === 1) {
            const operator = document.createElement('strong');
            operator.textContent = value;
            cell.append(operator);
        } else {
            cell.textContent = value;
        }
        row.append(cell);
    }

    const efficiencyCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.textContent = `${efficiency.category} (${record.mermaPercentage}%)`;
    badge.style.backgroundColor = efficiency.color;
    badge.style.color = 'white';
    badge.style.padding = '4px 8px';
    badge.style.borderRadius = '4px';
    badge.style.fontWeight = 'bold';
    badge.style.fontSize = '0.8rem';
    efficiencyCell.append(badge);
    row.append(efficiencyCell);
    return row;
}

function renderProductionHistory(records) {
    tableBody.replaceChildren();
    const sortedRecords = [...records].sort((first, second) => second.date.localeCompare(first.date));
    for (const record of sortedRecords) {
        tableBody.append(createProductionRow(record));
    }

    const totals = records.reduce((summary, record) => ({
        molded: summary.molded + record.molded,
        damaged: summary.damaged + record.damaged
    }), { molded: 0, damaged: 0 });
    const wasteRate = totals.molded ? (totals.damaged / totals.molded) * 100 : 0;
    document.getElementById('kpi-total').textContent = formatNumber(totals.molded - totals.damaged);
    document.getElementById('kpi-merma').textContent = `${wasteRate.toFixed(1)}%`;
}

function normalizeJsonRecord({ id, fecha, operarioId, productoId, cantidadFabricada, cantidadDanada, mermaPorcentaje }, operators, products) {
    const operator = operators.find(({ id: operatorId }) => operatorId === operarioId);
    const product = products.find(({ id: productId }) => productId === productoId);
    if (!operator || !product) {
        throw new Error(`El registro ${id} referencia un operario o producto inexistente.`);
    }

    return {
        id,
        date: fecha,
        operatorName: operator.nombre,
        brickType: product.nombre,
        productId: productoId,
        molded: cantidadFabricada,
        damaged: cantidadDanada,
        mermaPercentage: mermaPorcentaje
    };
}

async function initializeApp() {
    const submitButton = productionForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    productionResult.textContent = 'Cargando datos de producción...';

    try {
        const response = await fetch('./data.json');
        if (!response.ok) {
            throw new Error(`No se pudo cargar data.json (HTTP ${response.status}).`);
        }

        const { empresa, operarios, productos, registrosProduccion } = await response.json();
        if (![operarios, productos, registrosProduccion].every(Array.isArray)) {
            throw new Error('data.json no contiene las listas de operarios, productos y producción esperadas.');
        }

        if (empresa?.moneda) productionState.currency = empresa.moneda;
        productionState.products = productos;
        const baseRecords = registrosProduccion.map(record =>
            normalizeJsonRecord(record, operarios, productos)
        );
        productionState.savedRecords = getSavedRecords();
        productionState.productionRecords = [...baseRecords, ...productionState.savedRecords];

        renderProductOptions(productionState.products);
        renderInventory(productionState.products, productionState.savedRecords);
        renderProductionHistory(productionState.productionRecords);
        submitButton.disabled = false;
        productionResult.textContent = '';
    } catch (error) {
        productionResult.textContent = window.location.protocol === 'file:'
            ? 'Para cargar data.json, abre el proyecto desde un servidor local (por ejemplo, Live Server en VS Code), no directamente como archivo.'
            : `No se pudieron cargar los datos. ${error.message}`;
    }
}

productionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const operatorName = document.getElementById('operator-name').value.trim();
    const productId = brickTypeSelect.value;
    const molded = Number(document.getElementById('molded-amount').value);
    const damaged = Number(document.getElementById('damaged-amount').value);

    if (!operatorName) {
        productionResult.textContent = 'Ingresa el nombre del operario.';
        return;
    }
    if (!Number.isInteger(molded) || molded <= 0) {
        productionResult.textContent = 'La cantidad fabricada debe ser un número entero mayor a cero.';
        return;
    }
    if (!Number.isInteger(damaged) || damaged < 0 || damaged > molded) {
        productionResult.textContent = 'La cantidad dañada debe ser un entero entre cero y la cantidad fabricada.';
        return;
    }
    if (!productId) {
        productionResult.textContent = 'Selecciona un producto válido.';
        return;
    }

    // La merma se calcula sobre la producción fabricada y el inventario recibe solo las piezas aprobadas.
    const product = productionState.products.find(({ id }) => id === productId);
    if (!product) {
        productionResult.textContent = 'El producto seleccionado ya no está disponible. Recarga los datos e inténtalo de nuevo.';
        return;
    }

    const mermaPercentage = Number(((damaged / molded) * 100).toFixed(1));
    const today = new Date();
    const currentIsoDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    const record = {
        id: `PR-local-${Date.now()}`,
        date: currentIsoDate,
        operatorName,
        brickType: product.nombre,
        productId,
        molded,
        damaged,
        mermaPercentage
    };

    try {
        const updatedRecords = [record, ...productionState.savedRecords];
        localStorage.setItem(productionStorageKey, JSON.stringify(updatedRecords));
        productionState.savedRecords = updatedRecords;
    } catch (error) {
        productionResult.textContent = `No se pudo guardar el registro. Verifica el espacio disponible del navegador e inténtalo de nuevo. ${error.message}`;
        return;
    }

    productionState.productionRecords.push(record);
    renderProductionHistory(productionState.productionRecords);
    renderInventory(productionState.products, productionState.savedRecords);

    document.getElementById('molded-amount').value = '';
    document.getElementById('damaged-amount').value = '';
    document.getElementById('goal-amount').value = '';
    document.getElementById('goal-months').value = '';
    productionResult.textContent = 'Registro guardado correctamente en este navegador.';
});

initializeApp();

const questionInput = document.getElementById('question-input');
const questionResult = document.getElementById('question-result');

function submitProductionQuestion() {
    const question = questionInput.value.trim();
    if (!question) {
        questionResult.textContent = 'Escribe una pregunta sobre la producción registrada.';
        return;
    }

    const rows = Array.from(document.querySelectorAll('#table-body tr'));
    questionResult.textContent = getProductionQuestionAnswer(question, rows);
}

questionInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitProductionQuestion();
    }
});

document.getElementById('question-submit').addEventListener('click', submitProductionQuestion);

const exportResult = document.getElementById('export-result');
const tableHeaders = Array.from(document.querySelectorAll('.data-table thead th')).map(cell => cell.textContent.trim());

function getExportRows() {
    return Array.from(document.querySelectorAll('#table-body tr')).map(row => Array.from(row.cells).map(cell => cell.textContent.trim()));
}

function escapeCsvCell(value) {
    let safeValue = String(value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadFile(blob, fileName) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function exportExcelCsv() {
    const rows = getExportRows();
    if (!rows.length) {
        exportResult.textContent = 'No hay registros para exportar.';
        return;
    }

    const csvRows = [tableHeaders, ...rows].map(row => row.map((value, index) => {
        if ((index === 3 || index === 4) && /^-?\d+(?:[.,]\d+)?$/.test(value.trim())) {
            return String(Number(value.replace(',', '.')));
        }
        return escapeCsvCell(value);
    }).join(';'));
    const csv = `\uFEFF${csvRows.join('\r\n')}`;
    const today = new Date();
    const dateStamp = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `reporte-produccion-${dateStamp}.csv`);
    exportResult.textContent = 'Reporte compatible con Excel descargado.';
}

function encodePdfText(value) {
    const specialCharacters = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]]);
    return Array.from(String(value), character => {
        const codePoint = character.codePointAt(0);
        const byte = codePoint <= 0xff ? codePoint : specialCharacters.get(codePoint) ?? 0x3f;
        return byte.toString(16).padStart(2, '0');
    }).join('').toUpperCase();
}

function wrapPdfText(value, maxCharacters, maxLines = 5) {
    const words = String(value).split(/\s+/);
    const lines = [];
    let line = '';

    for (const word of words) {
        if (word.length > maxCharacters) {
            if (line) lines.push(line);
            line = '';
            for (let index = 0; index < word.length; index += maxCharacters) {
                lines.push(word.slice(index, index + maxCharacters));
            }
            continue;
        }

        const nextLine = line ? `${line} ${word}` : word;
        if (nextLine.length > maxCharacters) {
            lines.push(line);
            line = word;
        } else {
            line = nextLine;
        }
    }

    if (line) lines.push(line);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxCharacters - 3))}...`;
    }
    return lines.length ? lines : [''];
}

function createProductionPdf(rows) {
    const pageWidth = 842;
    const pageHeight = 595;
    const left = 40;
    const right = 40;
    const bottom = 36;
    const footerHeight = 18;
    const headerHeight = 27;
    const fontSize = 8;
    const lineHeight = 10;
    const columnWidths = [87, 100, 184, 92, 85, 214];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const headers = ['Fecha', 'Operario', 'Tipo de Pieza', 'Fabricados', 'Dañados', 'Eficiencia (Clasificación)'];
    const dataRows = rows.length ? rows : [['', '', 'No hay registros de producción.', '', '', '']];
    const preparedRows = dataRows.map(values => {
        const cells = values.map((value, index) => {
            const maxCharacters = Math.max(8, Math.floor((columnWidths[index] - 12) / (fontSize * 0.52)));
            return wrapPdfText(value, maxCharacters);
        });
        const lineCount = Math.max(...cells.map(cell => cell.length));
        return { cells, height: Math.max(23, lineCount * lineHeight + 8) };
    });
    const pages = [{ top: 105, rows: [], usedHeight: 0 }];

    for (const row of preparedRows) {
        let currentPage = pages[pages.length - 1];
        if (currentPage.top + headerHeight + currentPage.usedHeight + row.height > pageHeight - bottom - footerHeight) {
            currentPage = { top: 62, rows: [], usedHeight: 0 };
            pages.push(currentPage);
        }
        currentPage.rows.push(row);
        currentPage.usedHeight += row.height;
    }

    const drawText = (text, x, top, size, font = 'F1', color = '0.16 0.18 0.17') =>
        `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(1)} ${(pageHeight - top).toFixed(1)} Tm <${encodePdfText(text)}> Tj ET\n`;
    const drawRect = (x, top, width, height, color) =>
        `${color} rg ${x} ${(pageHeight - top - height).toFixed(1)} ${width} ${height} re f\n`;
    const drawLine = (x1, top1, x2, top2, color = '0.82 0.78 0.72') =>
        `${color} RG 0.5 w ${x1.toFixed(1)} ${(pageHeight - top1).toFixed(1)} m ${x2.toFixed(1)} ${(pageHeight - top2).toFixed(1)} l S\n`;
    const streams = pages.map((page, pageIndex) => {
        let stream = '';
        if (pageIndex === 0) {
            stream += drawText('BrickFlow | Historial de Produccion', left, 43, 17, 'F2', '0.22 0.16 0.12');
            stream += drawText(`Registros: ${rows.length}  |  Generado: ${new Date().toLocaleDateString('es-ES')}`, left, 65, 9, 'F1', '0.39 0.31 0.25');
        } else {
            stream += drawText('BrickFlow | Historial de Produccion', left, 38, 12, 'F2', '0.22 0.16 0.12');
        }

        let top = page.top;
        stream += drawRect(left, top, tableWidth, headerHeight, '0.91 0.72 0.39');
        let x = left;
        headers.forEach((header, index) => {
            stream += drawText(header, x + 6, top + 17, 8, 'F2', '0.22 0.16 0.12');
            x += columnWidths[index];
        });
        top += headerHeight;
        stream += drawLine(left, top, left + tableWidth, top);

        page.rows.forEach((row, rowIndex) => {
            if (rowIndex % 2 === 1) stream += drawRect(left, top, tableWidth, row.height, '0.99 0.97 0.94');
            x = left;
            row.cells.forEach((lines, columnIndex) => {
                lines.forEach((line, lineIndex) => {
                    stream += drawText(line, x + 6, top + 14 + lineIndex * lineHeight, fontSize);
                });
                x += columnWidths[columnIndex];
            });
            top += row.height;
            stream += drawLine(left, top, left + tableWidth, top);
        });

        x = left;
        columnWidths.forEach(width => {
            stream += drawLine(x, page.top, x, top);
            x += width;
        });
        stream += drawLine(left + tableWidth, page.top, left + tableWidth, top);
        stream += drawText(`Pagina ${pageIndex + 1} de ${pages.length}`, pageWidth - right - 80, pageHeight - 20, 8, 'F1', '0.39 0.31 0.25');
        return stream;
    });

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    const pageReferences = [];
    streams.forEach((stream, index) => {
        const pageObject = 5 + index * 2;
        const contentObject = pageObject + 1;
        pageReferences.push(`${pageObject} 0 R`);
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    });
    objects[1] = `<< /Type /Pages /Kids [${pageReferences.join(' ')}] /Count ${pages.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const crossReferenceOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
    return pdf;
}

function exportPdf() {
    const rows = getExportRows();
    const pdf = createProductionPdf(rows);
    const today = new Date();
    const dateStamp = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    downloadFile(new Blob([pdf], { type: 'application/pdf' }), `reporte-produccion-${dateStamp}.pdf`);
    exportResult.textContent = 'Archivo PDF con el historial descargado.';
}

document.getElementById('export-excel').addEventListener('click', exportExcelCsv);
document.getElementById('export-pdf').addEventListener('click', exportPdf);
document.getElementById('hero-cta').addEventListener('click', function() {
    setTimeout(() => document.getElementById('operator-name').focus({ preventScroll: true }), 400);
});
