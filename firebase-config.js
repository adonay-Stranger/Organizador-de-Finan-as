// Configuração do Firebase (sincronização entre os celulares).
//
// Enquanto `firebaseConfig` for null, o app funciona só no aparelho em que
// está aberto (os dados ficam salvos no próprio navegador).
//
// Para você e sua esposa verem os mesmos gastos, siga o passo a passo do
// README.md e cole aqui o objeto que o Firebase mostra, por exemplo:
//
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "minha-obra-12345.firebaseapp.com",
//   projectId: "minha-obra-12345",
//   storageBucket: "minha-obra-12345.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abc123"
// };
//
// Esses dados não são senha: eles só dizem ao app qual projeto usar.
// Quem protege os dados são as regras do Firestore (arquivo firestore.rules).

export const firebaseConfig = {
  apiKey: "AIzaSyBu2epzpP011XiZcYs0dt3Ft7P8T9YN4Zw",
  authDomain: "gerenciador-de-recursos-5094f.firebaseapp.com",
  projectId: "gerenciador-de-recursos-5094f",
  storageBucket: "gerenciador-de-recursos-5094f.firebasestorage.app",
  messagingSenderId: "575204472203",
  appId: "1:575204472203:web:ad8a772fb3e8808fb12b8e"
};

// Identificador da obra no banco de dados. Não precisa mudar.
export const OBRA_ID = "minha-casa";
