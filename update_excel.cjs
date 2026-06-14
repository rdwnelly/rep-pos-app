const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles) {
  let files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(__dirname, dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles('screens').filter(f => f.endsWith('.tsx'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Add exportToExcel to imports from '../utils'
    if (!content.includes('exportToExcel') && content.includes('XLSX')) {
        content = content.replace(/(import \{[^}]*)( \} from '\.\.\/utils';)/, "$1, exportToExcel$2");
        if (content.indexOf('exportToExcel') === -1 && content.indexOf('XLSX') > -1) {
             content = content.replace(/(import \{)([^}]*)( \} from '\.\.\/utils';)/, "$1$2, exportToExcel$3");
             if (content.indexOf('exportToExcel') === -1) {
                 // In case it wasn't matched properly, fallback
                 content = content.replace(/import \{ /, "import { exportToExcel, ");
             }
        }
        changed = true;
    }

    // Remove XLSX import
    if (content.includes("import * as XLSX from 'xlsx';")) {
        content = content.replace(/import \* as XLSX from 'xlsx';\n?/g, '');
        changed = true;
    }

    // specific replacements per file logic
    // For Finance.tsx
    if (content.includes("XLSX.utils.json_to_sheet(data);") && content.includes("XLSX.writeFile")) {
        content = content.replace(/const worksheet = XLSX\.utils\.json_to_sheet\([^;]+\);\s*const workbook = XLSX\.utils\.book_new\(\);\s*XLSX\.utils\.book_append_sheet\([^;]+\);\s*(if \([^;]+\) \{\s*worksheet\['!cols'\] = cols;\s*\})?\s*XLSX\.writeFile\([^;]+\);/g, "exportToExcel(data, fileNamePrefix || 'Laporan', sheetName || 'Data', cols || undefined);");

        content = content.replace(/const worksheet = XLSX\.utils\.json_to_sheet\([^;]+\);\s*const workbook = XLSX\.utils\.book_new\(\);\s*XLSX\.utils\.book_append_sheet\([^;]+\);\s*XLSX\.writeFile\([^;]+\);/g, "exportToExcel(data, 'Laporan', 'Data');");
        
        content = content.replace(/const worksheet = XLSX\.utils\.json_to_sheet\(([^)]+)\);\s*const workbook = XLSX\.utils\.book_new\(\);\s*XLSX\.utils\.book_append_sheet\(workbook, worksheet, ([^)]+)\);\s*(if \([^;]+\) \{\s*worksheet\['!cols'\] = cols;\s*\})?\s*XLSX\.writeFile\(workbook, ([^)]+)\);/g, (match, p1, p2, p3, p4) => {
             // extract fileNamePrefix heuristic
             let prefix = "'Data'";
             if (p4.includes('fileNamePrefix')) prefix = 'fileNamePrefix';
             else if (p4.includes('activeTab')) prefix = '`Riwayat_${activeTab}`';
             else prefix = p4.split('_')[0] || "'Data'";
             return `exportToExcel(${p1}, ${prefix}, ${p2}${p3 ? ', cols' : ''});`;
        });
        
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
    }
});
console.log('Processed screens.');
