import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeProjectFiles(projectId, files, basePath) {
    const projectPath = join(basePath, projectId);
    
    await mkdir(projectPath, { recursive: true });
    
    for (const [filepath, content] of Object.entries(files)) {
        const fullPath = join(projectPath, filepath);
        const dir = join(fullPath, '..');
        await mkdir(dir, { recursive: true });
        await writeFile(fullPath, content, 'utf-8');
    }
    
    return projectPath;
}

export function detectLanguageFromFiles(files) {
    const filenames = Object.keys(files);
    
    if (filenames.some(f => f.endsWith('next.config.js')) || filenames.some(f => f.endsWith('next.config.mjs'))) {
        return { language: 'nextjs', isStreamlit: false };
    }
    
    if (filenames.some(f => f.endsWith('package.json'))) {
        const pkg = JSON.parse(files[filenames.find(f => f.endsWith('package.json'))]);
        if (pkg.dependencies?.streamlit || filenames.includes('streamlit_app.py')) {
            return { language: 'python', isStreamlit: true };
        }
        if (pkg.dependencies?.next || pkg.devDependencies?.next) {
            return { language: 'nextjs', isStreamlit: false };
        }
        return { language: 'nodejs', isStreamlit: false };
    }
    if (filenames.some(f => f.endsWith('go.mod'))) return { language: 'go', isStreamlit: false };
    if (filenames.some(f => f.endsWith('Cargo.toml'))) return { language: 'rust', isStreamlit: false };
    if (filenames.some(f => f.endsWith('requirements.txt'))) return { language: 'python', isStreamlit: false };
    if (filenames.some(f => f.endsWith('deno.json') || f.endsWith('deno.jsonc'))) return { language: 'deno', isStreamlit: false };
    if (filenames.includes('index.html')) return { language: 'static', isStreamlit: false };
    if (filenames.some(f => f.endsWith('.py'))) return { language: 'python', isStreamlit: false };
    
    return { language: 'unknown', isStreamlit: false };
}

export function scaffoldNodeJS(files) {
    const pkgPath = Object.keys(files).find(f => f.endsWith('package.json'));
    if (!pkgPath) {
        files['package.json'] = JSON.stringify({
            name: 'deployed-project',
            version: '1.0.0',
            type: 'module',
            scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
            dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
            devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.2.0' }
        }, null, 2);
        
        if (!files['vite.config.js']) {
            files['vite.config.js'] = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: { host: '0.0.0.0' }
})`;
        }
        
        if (!files['index.html']) {
            files['index.html'] = `<!DOCTYPE html>
<html>
<head><title>Deployed Project</title></head>
<body><div id="root"></div></body>
</html>`;
        }
        
        if (!files['src/main.jsx']) {
            files['src/main.jsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><App /></React.StrictMode>
)`;
        }
        
        if (!files['src/App.jsx']) {
            files['src/App.jsx'] = `export default function App() {
    return <h1>Hello Deployed!</h1>
}`;
        }
    }
    return files;
}

export function scaffoldPython(files) {
    if (!files['main.py']) {
        files['main.py'] = `import streamlit as st
st.title("Deployed Project")
st.write("Hello from deployed Streamlit app!")`;
    }
    if (!files['requirements.txt']) {
        files['requirements.txt'] = 'streamlit';
    }
    return files;
}
