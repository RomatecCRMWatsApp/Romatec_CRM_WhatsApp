import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = import.meta.dirname;
const candidates = ['logo.png', 'Icone_Romatec_CRM_2026.png'];
const input = candidates.map(f => path.join(dir, f)).find(fs.existsSync);
const output = path.join(dir, 'build', 'icon.ico');

if (!input) {
  console.error('❌ Nenhum PNG encontrado. Salve o logo como logo.png na pasta electron/');
  process.exit(1);
}

console.log(`Convertendo: ${path.basename(input)} → build/icon.ico`);

// Escreve script PowerShell em arquivo temp (evita problemas de escape em linha)
const ps1 = path.join(os.tmpdir(), 'romatec_make_icon.ps1');
fs.writeFileSync(ps1, `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap '${input}'
$dest = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($bmp, 0, 0, 256, 256)
$g.Dispose()
$bmp.Dispose()
$ms = New-Object System.IO.MemoryStream
$dest.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Close()
$dest.Dispose()
$writer = New-Object System.IO.BinaryWriter([System.IO.File]::Create('${output}'))
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Close()
Write-Host 'OK'
`.trim(), 'utf8');

try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (fs.existsSync(output)) {
    console.log('✅ build/icon.ico gerado com sucesso!');
  } else {
    throw new Error('Arquivo ICO não foi criado');
  }
} catch (e) {
  console.error('❌ Falha ao gerar ICO:', e.message);
  process.exit(1);
} finally {
  fs.rmSync(ps1, { force: true });
}
