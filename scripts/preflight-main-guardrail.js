// Script para verificação antes do merge para main

const { execSync } = require('child_process');

try {
    execSync('npm run build');
    console.log('Build sucesso!');
} catch (error) {
    console.error('Erro no build:', error.message);
    process.exit(1);
}

try {
    const versionResponse = execSync('curl -s http://localhost:3000/api/version');
    if (versionResponse) {
        console.log('API versione está funcionando!');
    } else {
        throw new Error('A API não retornou a versão.');
    }
} catch (error) {
    console.error('Erro ao chamar a versão da API:', error.message);
    process.exit(1);
}

console.log('Todas as verificações passadas!');