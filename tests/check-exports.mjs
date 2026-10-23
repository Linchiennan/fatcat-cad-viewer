import { chromium } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
const png=await readFile('../evidence/synthetic-export.png');const pdf=await PDFDocument.load(await readFile('../evidence/synthetic-export.pdf'));
assert.equal(pdf.getPageCount(),1);const page=pdf.getPage(0);assert.ok(page.getWidth()>0&&page.getHeight()>0);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {const p=await browser.newPage();const pixels=await p.evaluate(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;const colors=new Set();let opaque=0;for(let i=0;i<d.length;i+=4){colors.add([d[i],d[i+1],d[i+2],d[i+3]].join(','));if(d[i+3])opaque++;}return {width:c.width,height:c.height,colors:colors.size,opaque};},png.toString('base64'));assert.ok(pixels.colors>10&&pixels.opaque>1000);const result={png:pixels,pdf:{pages:pdf.getPageCount(),width:page.getWidth(),height:page.getHeight()},pass:true};await writeFile('../evidence/export-structure.json',JSON.stringify(result,null,2));console.log(result);}finally{await browser.close();}
