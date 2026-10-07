# Publicação do Neuronow: GitHub, Vercel e Supabase

## Estado

- **Vercel** serve a aplicação Vite como SPA; `vercel.json` direciona rotas ao
  `index.html`.
- **GitHub** guarda o código-fonte no repositório `thiago09012/novamente`.
- **Supabase** oferece login e uma cópia JSON privada por usuário. O Neuronow
  continua salvando primeiro no IndexedDB. Envio e restauração são manuais;
  ainda não há sincronização em tempo real entre dispositivos.
- Não coloque `service_role` em variáveis `VITE_*`, no navegador ou no Git.
  O app usa apenas a publishable/anon key e a migração habilita RLS por usuário.

## 1. Criar o projeto Supabase

1. Crie um projeto Supabase e guarde a senha do banco em um gerenciador seguro.
2. No SQL Editor, execute `supabase/migrations/20261006000000_create_mente_backups.sql`.
3. Em Authentication → URL Configuration, configure o Site URL para o domínio
   principal da Vercel e adicione como Redirect URLs o domínio de produção,
   seus domínios de preview usados para teste e `http://localhost:5173/**`.
4. Em Authentication → Providers, habilite Email. Para cadastro com confirmação,
   configure SMTP antes de abrir o registro ao público; o SMTP padrão é limitado.
5. Copie o Project URL e a publishable key (ou anon key legada) para as
   variáveis abaixo. Nunca use a `service_role` no frontend.

## 2. Preparar o ambiente local

```bash
cp .env.example .env.local
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local
npm run dev
```

Confira Configurações → Cópia na nuvem (Supabase): crie uma conta, envie uma
cópia, saia e entre novamente para confirmar a leitura. Restaurar substitui os
dados locais; exporte um JSON antes dessa operação.

## 3. Publicar o código

1. Crie um repositório GitHub **privado** para começar e envie o código sem
   `.env.local`, backups, nem `mente-vault/`.
2. Importe o repositório no Vercel. Configure framework Vite, build command
   `npm run build` e output directory `dist`.
3. Em Vercel → Settings → Environment Variables, defina
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para Production, Preview e
   Development. Use a mesma configuração para Preview apenas se desejar que
   cadastros e cópias de teste compartilhem o projeto Supabase de produção.
4. Faça um deploy e teste cadastro, login, envio e restauração no domínio.

Cada push na branch de produção gera um deploy de produção; branches/PRs podem
gerar previews quando o repositório estiver conectado ao Vercel.

## Limites do modelo atual

- A nuvem recebe o backup integral (notas, configurações, visualizações e
  lixeira) como JSON na tabela `mente_backups`, uma linha por usuário.
- RLS limita as operações ao `auth.uid()` do usuário conectado. Ainda assim,
  o conteúdo enviado fica legível no projeto Supabase para administradores;
  este fluxo não oferece criptografia ponta a ponta.
- Enviar substitui a cópia anterior dessa conta; restaurar substitui o banco
  local do navegador. O app não faz merge entre dispositivos.
- A publicação torna o app acessível pela Internet. Antes de divulgar o link,
  revise as configurações de cadastro e confirme RLS no projeto remoto.
