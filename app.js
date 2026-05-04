// Supabase Configuration
const SUPABASE_URL = 'https://ttboirmvzyrexlxooxry.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Ym9pcm12enlyZXhseG9veHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2OTE4MTAsImV4cCI6MjA3NzI2NzgxMH0.gIJ9LlLOfdDIkeBTQQbQx-8HFpj0frN2Vrg2VhyRUvs';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let currentStore = null;
let allProducts = [];
let previewData = [];
let selectedProducts = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Check Authentication
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        await loadUserStore();
        showApp();
    } else {
        showLogin();
    }
    
    // Listen for auth state changes (handles OAuth redirects)
    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await loadUserStore();
            showApp();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentStore = null;
            showLogin();
        }
    });
}

// Load User's Store
async function loadUserStore() {
    try {
        const { data, error } = await sb
            .from('stores')
            .select('id, name')
            .eq('owner_id', currentUser.id)
            .single();

        if (error) {
            // If user doesn't have a store, show error and sign out
            if (error.code === 'PGRST116') {
                showToast('No store found for this account. Please create a store first.', 'error');
                setTimeout(() => handleLogout(), 2000);
                return;
            }
            throw error;
        }
        
        currentStore = data;
        document.getElementById('store-name').textContent = data.name;
    } catch (error) {
        showToast('Error loading store: ' + error.message, 'error');
        setTimeout(() => handleLogout(), 2000);
    }
}

// Event Listeners
function setupEventListeners() {
    // Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('google-signin-btn').addEventListener('click', handleGoogleSignIn);
    document.getElementById('clear-session-btn').addEventListener('click', clearSession);
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    // Upload
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    document.getElementById('browse-btn').addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag & Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    
    // Template Download
    document.getElementById('download-template').addEventListener('click', downloadTemplate);
    
    // Preview Actions
    document.getElementById('cancel-preview').addEventListener('click', cancelPreview);
    document.getElementById('confirm-import').addEventListener('click', confirmImport);
    
    // Products
    document.getElementById('search-input').addEventListener('input', filterProducts);
    document.getElementById('select-all').addEventListener('change', toggleSelectAll);
    document.getElementById('bulk-edit-btn').addEventListener('click', openBulkEdit);
    
    // Bulk Edit Modal
    document.getElementById('close-bulk-edit').addEventListener('click', closeBulkEdit);
    document.getElementById('cancel-bulk-edit').addEventListener('click', closeBulkEdit);
    document.getElementById('save-bulk-edit').addEventListener('click', saveBulkEdit);
    
    // Export
    document.getElementById('export-all-btn').addEventListener('click', exportProducts);
}

// Login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        await loadUserStore();
        showApp();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.add('show');
    }
}

// Google Sign-In
async function handleGoogleSignIn() {
    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'https://wndwshpr.github.io/uploader'
            }
        });
        
        if (error) throw error;
    } catch (error) {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = 'Google sign-in failed: ' + error.message;
        errorEl.classList.add('show');
    }
}

// Logout
async function handleLogout() {
    await sb.auth.signOut();
    currentUser = null;
    currentStore = null;
    showLogin();
}

// Clear Session
function clearSession() {
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
}

// Show/Hide Screens
function showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
}

function showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    loadProducts();
}

// Switch Views
function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    // Load data if needed
    if (viewName === 'products') {
        loadProducts();
    }
}

// File Handling
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
}

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
        parseCSV(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
        parseExcel(file);
    } else {
        showToast('Unsupported file type', 'error');
    }
}

// Parse CSV
function parseCSV(file) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            previewData = results.data;
            showPreview(previewData);
        },
        error: (error) => {
            showToast('Error parsing CSV: ' + error.message, 'error');
        }
    });
}

// Parse Excel
function parseExcel(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            previewData = jsonData;
            showPreview(previewData);
        } catch (error) {
            showToast('Error parsing Excel: ' + error.message, 'error');
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Show Preview
function showPreview(data) {
    if (data.length === 0) {
        showToast('No data found in file', 'error');
        return;
    }
    
    const previewSection = document.getElementById('preview-section');
    const thead = document.getElementById('preview-thead');
    const tbody = document.getElementById('preview-tbody');
    const countEl = document.getElementById('preview-count');
    
    // Get columns
    const columns = Object.keys(data[0]);
    
    // Build header
    thead.innerHTML = '<tr>' + columns.map(col => `<th>${col}</th>`).join('') + '</tr>';
    
    // Build rows (show first 10)
    tbody.innerHTML = data.slice(0, 10).map(row => {
        return '<tr>' + columns.map(col => `<td>${row[col] || ''}</td>`).join('') + '</tr>';
    }).join('');
    
    countEl.textContent = `${data.length} products`;
    previewSection.style.display = 'block';
}

// Cancel Preview
function cancelPreview() {
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('file-input').value = '';
    previewData = [];
}

// Confirm Import
async function confirmImport() {
    if (!currentStore) {
        showToast('No store found', 'error');
        return;
    }
    
    showToast('Validating products...', 'success');
    
    try {
        // Map and validate CSV columns
        const validProducts = [];
        const errors = [];
        
        previewData.forEach((row, index) => {
            const rowNum = index + 2; // +2 for header row and 1-based indexing
            
            // Extract values with fallbacks
            const name = row.name || row.Name || row.product_name || row.Product_Name || '';
            const priceStr = row.price || row.Price || row.cost || row.Cost || '0';
            const stockStr = row.stock || row.Stock || row.quantity || row.Quantity || row.stock_quantity || '0';
            const category = row.category || row.Category || null;
            const barcode = row.barcode || row.Barcode || row.sku || row.SKU || row.upc || row.UPC || null;
            const description = row.description || row.Description || row.details || row.Details || null;
            
            // Validate required fields
            if (!name || name.trim() === '') {
                errors.push(`Row ${rowNum}: Missing product name`);
                return;
            }
            
            const price = parseFloat(priceStr);
            if (isNaN(price) || price < 0) {
                errors.push(`Row ${rowNum}: Invalid price "${priceStr}"`);
                return;
            }
            
            const stock = parseInt(stockStr);
            if (isNaN(stock) || stock < 0) {
                errors.push(`Row ${rowNum}: Invalid stock "${stockStr}"`);
                return;
            }
            
            // Add valid product
            validProducts.push({
                store_id: currentStore.id,
                name: name.trim(),
                price: price,
                stock_quantity: stock,
                category: category ? category.trim() : null,
                barcode: barcode ? barcode.trim() : null,
                description: description ? description.trim() : null,
                listing_type: 'product',
                is_available: true,
                is_hidden: false,
                images: [],
                thumbnails: [],
                mediums: [],
                larges: []
            });
        });
        
        // Show validation results
        if (errors.length > 0) {
            const errorMsg = `Found ${errors.length} error(s):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`;
            if (!confirm(`${errorMsg}\n\nImport ${validProducts.length} valid products and skip ${errors.length} invalid rows?`)) {
                return;
            }
        }
        
        if (validProducts.length === 0) {
            showToast('No valid products to import', 'error');
            return;
        }
        
        showToast(`Importing ${validProducts.length} products...`, 'success');
        
        // Insert in batches of 100
        const batchSize = 100;
        let imported = 0;
        
        for (let i = 0; i < validProducts.length; i += batchSize) {
            const batch = validProducts.slice(i, i + batchSize);
            const { error } = await sb
                .from('store_products')
                .insert(batch);
            
            if (error) throw error;
            imported += batch.length;
        }
        
        const message = errors.length > 0 
            ? `Imported ${imported} products (${errors.length} skipped)`
            : `Successfully imported ${imported} products`;
        
        showToast(message, 'success');
        cancelPreview();
        switchView('products');
    } catch (error) {
        showToast('Import failed: ' + error.message, 'error');
    }
}

// Load Products
async function loadProducts() {
    if (!currentStore) return;
    
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading products...</td></tr>';
    
    try {
        const { data, error } = await sb
            .from('store_products')
            .select('*')
            .eq('store_id', currentStore.id)
            .order('name');
        
        if (error) throw error;
        
        allProducts = data;
        renderProducts(data);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">Error: ${error.message}</td></tr>`;
    }
}

// Render Products
function renderProducts(products) {
    const tbody = document.getElementById('products-tbody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No products found</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td><input type="checkbox" class="product-checkbox" data-id="${product.id}"></td>
            <td>${product.name}</td>
            <td>${product.price.toFixed(2)}</td>
            <td>${product.stock_quantity}</td>
            <td>${product.category || '-'}</td>
            <td>${product.barcode || '-'}</td>
            <td>
                <button class="btn-text" onclick="deleteProduct('${product.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
    
    // Add checkbox listeners
    document.querySelectorAll('.product-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedProducts);
    });
}

// Filter Products
function filterProducts(e) {
    const query = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
    );
    renderProducts(filtered);
}

// Select All
function toggleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.product-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
    });
    updateSelectedProducts();
}

// Update Selected Products
function updateSelectedProducts() {
    selectedProducts.clear();
    document.querySelectorAll('.product-checkbox:checked').forEach(cb => {
        selectedProducts.add(cb.dataset.id);
    });
}

// Delete Product
window.deleteProduct = async function(productId) {
    if (!confirm('Delete this product?')) return;
    
    try {
        const { error } = await sb
            .from('store_products')
            .delete()
            .eq('id', productId);
        
        if (error) throw error;
        
        showToast('Product deleted', 'success');
        loadProducts();
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }
};

// Bulk Edit
function openBulkEdit() {
    if (selectedProducts.size === 0) {
        showToast('Select products first', 'error');
        return;
    }
    
    document.getElementById('bulk-edit-count').textContent = 
        `Editing ${selectedProducts.size} products`;
    document.getElementById('bulk-edit-modal').classList.add('active');
}

function closeBulkEdit() {
    document.getElementById('bulk-edit-modal').classList.remove('active');
    document.getElementById('bulk-price').value = '';
    document.getElementById('bulk-stock').value = '';
    document.getElementById('bulk-category').value = '';
}

async function saveBulkEdit() {
    const price = document.getElementById('bulk-price').value;
    const stock = document.getElementById('bulk-stock').value;
    const category = document.getElementById('bulk-category').value;
    
    const updates = {};
    if (price) updates.price = parseFloat(price);
    if (stock) updates.stock_quantity = parseInt(stock);
    if (category) updates.category = category;
    
    if (Object.keys(updates).length === 0) {
        showToast('No changes to apply', 'error');
        return;
    }
    
    try {
        for (const productId of selectedProducts) {
            const { error } = await sb
                .from('store_products')
                .update(updates)
                .eq('id', productId);
            
            if (error) throw error;
        }
        
        showToast(`Updated ${selectedProducts.size} products`, 'success');
        closeBulkEdit();
        loadProducts();
        selectedProducts.clear();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'error');
    }
}

// Export Products
async function exportProducts() {
    if (!currentStore) return;
    
    try {
        const { data, error } = await sb
            .from('store_products')
            .select('name, price, stock_quantity, category, barcode, description')
            .eq('store_id', currentStore.id);
        
        if (error) throw error;
        
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_${Date.now()}.csv`;
        a.click();
        
        showToast('Export complete', 'success');
    } catch (error) {
        showToast('Export failed: ' + error.message, 'error');
    }
}

// Download Template
function downloadTemplate() {
    const template = [
        ['name', 'price', 'stock', 'category', 'barcode', 'description'],
        ['Example Product', '9.99', '100', 'Electronics', '123456789', 'Product description']
    ];
    
    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.csv';
    a.click();
}

// Toast Notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
