export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Link inválido ou expirado</h1>
        <p className="mb-6">O link de autenticação já foi usado ou expirou.<br/>Por favor, volta ao login e pede novo link.</p>
        <a href="/login" className="text-blue-600 underline">Voltar ao login</a>
      </div>
    </div>
  );
}
