const fs = require('fs');

const files = [
  'screens/CustomerHistory.tsx',
  'screens/People.tsx',
  'screens/Products.tsx',
  'screens/ReturnHistory.tsx',
  'screens/Settings.tsx',
  'screens/SoldItems.tsx',
  'screens/SupplierHistory.tsx',
  'screens/TransferHistory.tsx'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    content = content.replace(/const worksheet = XLSX\.utils\.json_to_sheet\(([^)]+)\);[\s\S]*?XLSX\.writeFile\(workbook, ([^)]+)\);/g, (match, dataVar, filenameStr) => {
        
        let sheetName = "'Data'";
        let sheetMatch = match.match(/XLSX\.utils\.book_append_sheet\([^,]+, [^,]+, ([^)]+)\);/);
        if (sheetMatch) {
            sheetName = sheetMatch[1].trim();
        }

        let prefix = "''";
        if (filenameStr.includes('Riwayat_Pelanggan')) {
             prefix = '`Riwayat_Pelanggan_${selectedCustomer?.name || \'All\'}`';
        } else if (filenameStr.includes('Riwayat_Retur')) {
             prefix = '`Riwayat_Retur_${activeTab}`';
        } else if (filenameStr.includes('Data_Bank')) {
             prefix = "'Data_Bank'";
        } else if (filenameStr.includes('Laporan_Barang_Terjual')) {
             prefix = "'Barang_Terjual'";
        } else if (filenameStr.includes('Riwayat_Supplier')) {
             prefix = '`Riwayat_Supplier_${selectedSupplier?.name || \'All\'}`';
        } else if (filenameStr.includes('Riwayat_Transfer')) {
             prefix = "'Riwayat_Transfer'";
        } else if (filenameStr.includes('Produk_')) {
             prefix = "'Produk'";
        } else if (filenameStr.includes('fileNamePrefix')) {
             prefix = 'fileNamePrefix';
        }

        let hasCols = match.includes("worksheet['!cols']");
        
        return `exportToExcel(${dataVar}, ${prefix}, ${sheetName}${hasCols ? ', cols' : ''});`;
    });

    fs.writeFileSync(file, content);
});
