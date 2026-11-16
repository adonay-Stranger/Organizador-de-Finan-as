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

export const firebaseConfig = null;

// Identificador da obra no banco de dados. Não precisa mudar.
export const OBRA_ID = "minha-casa";
