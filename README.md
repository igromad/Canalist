# Canalist

Extensão para Vivaldi, Chrome e Edge que monta uma fila de uploads pendentes e abre cada vídeo no player normal do YouTube.

## Instalação local

1. Se recebeu o ZIP, extraia a pasta.
2. Abra `vivaldi://extensions` no Vivaldi, `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. No [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), ative **YouTube Data API v3** em um projeto. Em **APIs e serviços → Credenciais**, crie uma chave de API e restrinja a chave à YouTube Data API v3.
5. Clique no ícone da extensão. Em **Configuração da API**, cole a chave e clique em **Salvar**. A chave fica no armazenamento local do perfil e é enviada ao Google nas consultas. Use uma chave própria para esta instalação local.

## Uso

1. Cole um `@handle`, uma URL de canal ou o link da [playlist de uploads do GameTrailers](https://www.youtube.com/playlist?list=UUJx5KP-pCUmL9eZUv-mIcNw). **Usar aba** copia o endereço do canal ou da playlist que estiver aberto. O campo vem preenchido com o último canal pesquisado com sucesso. Use **Canais recentes** para escolher um dos últimos 10.
2. Em **Publicado desde**, o padrão cobre os últimos sete dias do calendário, incluindo hoje. Você pode alterar a data ou limpar o campo para consultar todos os uploads. O corte começa à meia-noite da data escolhida, no fuso local. Escolha a ordem e clique em **Criar fila**.
3. A fila aparece no painel com títulos, miniaturas e destaque para o vídeo selecionado. Clique em qualquer item para abri-lo na mesma aba de reprodução. O botão de próximo marca o vídeo atual como assistido antes de avançar. As setas abaixo da lista mostram mais vídeos.
4. Quando um vídeo termina na aba de reprodução, a extensão grava o ID e abre o seguinte. Se o navegador exigir um clique para iniciar a reprodução, use o botão do player. Se fechar a aba ou reiniciar o navegador, **Abrir vídeo** reabre o item atual. **Encerrar fila** limpa a seleção sem apagar o histórico.
5. A opção **Registrar também vídeos concluídos fora da fila** conta sessões em páginas normais `/watch` do YouTube no mesmo perfil. Ela vem desativada. Após instalar ou recarregar a extensão, recarregue as abas do YouTube que já estavam abertas para ativar o registro nelas.

## Arquivo de assistidos

**Exportar TXT** baixa `assistidos.txt` com um ID por linha. **Importar TXT** combina os IDs com o histórico local e aceita linhas no formato do arquivo de downloads do Stacher/yt-dlp, como `youtube dQw4w9WgXcQ`. Cada ID importado fica excluído das filas futuras. O arquivo original fica intacto. Para desfazer uma conclusão recente, use **Desfazer última marcação** e gere a fila novamente.

## Uso do painel

- No cabeçalho, escolha **PT-BR** ou **English**. A extensão inicia em inglês e guarda a preferência neste perfil.

- Use **Adicionar** ou **Canais recentes** para selecionar vários canais. **Criar fila** combina os resultados em uma fila e aplica a mesma data e ordem ao conjunto. O painel lembra a última seleção.
- Ao voltar depois de fechar a aba da fila ou navegar para outro vídeo, escolha **Continuar fila** ou **Montar nova fila**. A extensão registra a posição enquanto o vídeo toca e ao pausar. Se a aba foi fechada, ela reabre o vídeo perto do ponto salvo. A fila anterior fica disponível até você iniciar outra ou clicar em **Encerrar fila**.
- Abra **Histórico local** para importar ou exportar IDs. Em **Configuração da API → Como criar uma chave de API**, você encontra o passo a passo com links para o Google Cloud.

## Escopo

- O histórico fica no perfil do navegador. Use o TXT para transferi-lo para outra instalação. O histórico anterior da conta do YouTube começa a contar nesta extensão quando você importa ou marca os IDs.
- A fila é mantida pela extensão e roda em `youtube.com/watch`. Ela fica neste navegador até você substituí-la ou encerrá-la. Os títulos e miniaturas vêm da API do YouTube e são consultados novamente ao reabrir o painel.
- A detecção automática depende da estrutura do player do YouTube. Se um vídeo estiver indisponível ou o player não sinalizar a conclusão, use os botões da fila. O registro automático cobre páginas `/watch`; a interface vertical de Shorts fica fora deste escopo.
- **Criar fila** consulta a playlist em páginas de até 50 e só conta vídeos dentro do período. Com uma data preenchida, a busca encerra após duas páginas seguidas com vídeos datados, todos anteriores ao corte. Um vídeo fora da ordem cronológica que apareça depois desse ponto pode ficar fora do resultado. Para consultar toda a playlist, limpe o campo de data.
- **Mais assistidos** ordena a seleção pelo total público de visualizações no YouTube, do maior para o menor. Empates priorizam os vídeos mais recentes.
