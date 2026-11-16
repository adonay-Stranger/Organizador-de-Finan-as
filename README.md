# Minha Obra

App para celular que controla os gastos da construção da casa:

- **Lançar gastos**: valor total, data, descrição e categoria (fundação, elétrica, mão de obra…).
- **Pagamentos efetuados**: cada gasto pode ter um ou vários pagamentos (à vista, entrada mais parcelas…). Em cada pagamento você informa o valor, a data, **de onde saiu o dinheiro** (poupança, financiamento, salário, FGTS…) e **anexa o comprovante** (foto ou PDF). O app mostra o que está pago, o que foi pago em parte e o que ainda falta pagar.
- **Meta do valor final**: barra de progresso com quanto já foi gasto e quanto falta.
- **Origens do dinheiro com valor previsto** (opcional): por exemplo, financiamento de R$ 200.000. O app mostra quanto ainda sobra em cada origem.
- **Relatório**: totais por categoria, por origem e por mês, além da lista completa de lançamentos. Dá para filtrar por período, salvar em PDF, baixar a planilha (abre no Excel e no Google Planilhas) ou compartilhar pelo WhatsApp.
- **Funciona sem internet**: o que for lançado na obra sem sinal é enviado quando a conexão voltar.
- **Compartilhado**: você e sua esposa entram cada um com a própria conta e veem os mesmos dados.
- **Backup** em arquivo.

É um site instalável (PWA), sem loja de aplicativos. No celular, abra o link e use a opção **Adicionar à tela de início**. Depois disso ele abre como um app.

---

## Passo 1 — Publicar o app (GitHub Pages)

1. No GitHub, abra este repositório → **Settings** → **Pages**.
2. Em **Build and deployment**, escolha **Source: Deploy from a branch**, **Branch: `main`**, pasta **`/ (root)`** e clique em **Save**.
3. Depois de 1 a 2 minutos, o endereço aparece no topo da página, algo como
   `https://adonay-stranger.github.io/Organizador-de-Finan-as/`.

> O GitHub Pages só funciona em repositório **público**, a não ser que você tenha um plano pago. Os gastos **não** ficam no repositório, ficam no Firebase (passo 2). Por isso deixar o código público não expõe os seus dados.

Sem o passo 2, o app já funciona, mas cada celular guarda os próprios dados.

## Passo 2 — Sincronizar os dois celulares (Firebase, gratuito)

### 2.1 Criar o projeto
1. Acesse <https://console.firebase.google.com> com uma conta Google e clique em **Criar projeto** (nome sugerido: `minha-obra`). O Google Analytics pode ficar desligado.

### 2.2 Ativar o login por e-mail e criar as duas contas
1. No menu, abra **Criação → Authentication → Vamos começar**.
2. Na aba **Método de login**, ative **E-mail/senha** e salve.
3. Na aba **Usuários**, clique em **Adicionar usuário** e crie a sua conta (e-mail e senha). Repita para a conta da sua esposa.
4. *(Recomendado)* Em **Configurações → Ações do usuário**, desmarque **Ativar criação (inscrição)**. Assim ninguém mais consegue criar conta.

### 2.3 Criar o banco de dados
1. No menu, abra **Criação → Firestore Database → Criar banco de dados**.
2. Escolha a localização `southamerica-east1 (São Paulo)` e comece no **modo de produção**.
3. Na aba **Regras**, apague o conteúdo e cole o que está no arquivo [`firestore.rules`](firestore.rules), **trocando os dois e-mails pelos de vocês**. Clique em **Publicar**.

### 2.4 Ligar o app ao projeto
1. Na página inicial do projeto, clique no ícone **`</>`** (Web), dê um apelido (ex.: `app`) e clique em **Registrar app**. Não precisa ativar o Hosting.
2. O Firebase mostra um bloco `const firebaseConfig = { apiKey: "...", ... }`. Copie só a parte entre chaves.
3. No GitHub, abra o arquivo [`firebase-config.js`](firebase-config.js), clique no lápis (editar) e troque
   ```js
   export const firebaseConfig = null;
   ```
   por
   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Depois clique em **Commit changes**.
4. Em **Authentication → Configurações → Domínios autorizados**, adicione `adonay-stranger.github.io`.

Pronto. Em 1 a 2 minutos o app passa a pedir login. Cada um entra com a própria conta e os gastos aparecem nos dois celulares.

> A `apiKey` do Firebase não é senha: ela só identifica o projeto e pode ficar no código. Quem protege os dados são as regras do passo 2.3, que só deixam entrar os dois e-mails de vocês.

### Já lancei gastos antes de configurar o Firebase
No celular onde estão os dados, abra **Ajustes → Baixar backup** *antes* de fazer o passo 2.4. Depois de entrar com a conta, use **Ajustes → Restaurar backup** com esse arquivo.

---

## Instalar no celular

- **iPhone (Safari):** abra o link → botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

## Comprovantes

- Fotos são reduzidas automaticamente (cerca de 100 a 400 KB cada) e ficam guardadas no próprio banco de dados do Firebase. Não é preciso ativar o Firebase Storage, que exige plano pago.
- PDFs podem ter até 700 KB. Se o PDF for maior, tire um print da tela do comprovante e anexe a imagem.
- O plano gratuito do Firestore guarda 1 GB, o que dá para alguns milhares de comprovantes.
- O backup em arquivo (Ajustes) inclui os comprovantes.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `styles.css`, `app.js` | Telas do app |
| `store.js` | Onde os dados são salvos (no aparelho ou no Firebase) |
| `firebase-config.js` | Configuração do Firebase (passo 2.4) |
| `firestore.rules` | Regras de acesso para colar no Firebase (passo 2.3) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalação no celular e funcionamento offline |

Ao alterar algum arquivo do app, aumente a versão em `sw.js` (`minha-obra-v1` → `v2`) para os celulares baixarem a versão nova.

Para testar no computador: `python3 -m http.server` nesta pasta e abra <http://localhost:8000>.
