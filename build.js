// Une los fuentes en un único HTML: dist/traste.html, index.html (GitHub Pages) y la versión para el visor de artefactos
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
// Tailwind 3.4.17 compilado en el build (sin depender del CDN en tiempo de ejecución)
const tools = path.join(__dirname, 'tools');
const tailwind = (name) => {
  execFileSync(path.join(tools, 'node_modules', '.bin', 'tailwindcss'), ['-c', 'tailwind.config.js', '-i', `in-${name}.css`, '-o', `out-${name}.css`, '--minify'], { cwd: tools, stdio: 'ignore' });
  return fs.readFileSync(path.join(tools, `out-${name}.css`), 'utf8');
};
// base (reset) → estilos propios → utilidades, para que md:hidden, etc. ganen a los componentes
const twBase = tailwind('base'), twUtils = tailwind('utils');
const head = `<title>Traste</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Afinador, acordes y canciones para aprender guitarra escuchando tu instrumento.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Inter:wght@400;500;600;700&display=swap">
<style>
${twBase}
${src('styles.css')}
${twUtils}
</style>`;
const scripts = `<script>
${src('icons.js')}
${src('dsp.js')}
${src('data.js')}
${src('cifrado.js')}
${src('app.js')}
${src('mysongs.js')}
${src('learn.js')}
</script>`;
const body = src('body.html');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), `${head}\n${body}\n${scripts}\n`);
const page = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e1014">
${head}
</head>
<body>
${body}
${scripts}
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'dist', 'traste.html'), page);
fs.writeFileSync(path.join(__dirname, 'index.html'), page); // portada de GitHub Pages
console.log('dist/traste.html', fs.statSync(path.join(__dirname, 'dist', 'traste.html')).size, 'bytes');
