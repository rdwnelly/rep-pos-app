const fs = require('fs');
let content = fs.readFileSync('utils/printHelpers.ts', 'utf8');

const GOOGLE_FONTS = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Lora:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">`;

// Inject google fonts into head
content = content.replace(/<head>/g, `<head>\n                ${GOOGLE_FONTS}`);

// Replace Arial with Inter
content = content.replace(/font-family:\s*Arial,\s*sans-serif/g, "font-family: 'Inter', sans-serif");

// Replace Courier New with Inter monospace
content = content.replace(/font-family:\s*'Courier New',\s*monospace/g, "font-family: 'Inter', monospace");

// Add Lora to header-title and store-name
content = content.replace(/\.header-title {/g, ".header-title { font-family: 'Lora', serif;");
content = content.replace(/\.store-name {/g, ".store-name { font-family: 'Lora', serif;");

// Update h3 inside the thermal/fallback print
content = content.replace(/<h3 style="margin:0; font-size: 14px;">/g, '<h3 style="font-family: \\\'Lora\\\', serif; margin:0; font-size: 14px;">');

// Update h2 in detail views
content = content.replace(/<h2>/g, '<h2 style="font-family: \\\'Lora\\\', serif;">');

fs.writeFileSync('utils/printHelpers.ts', content);
console.log("Updated printHelpers.ts");
