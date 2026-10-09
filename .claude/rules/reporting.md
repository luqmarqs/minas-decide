# Regras de retorno e relatório

Todo subagente, ao concluir, devolve obrigatoriamente:

1. Lista de arquivos criados/alterados.
2. Resumo das mudanças (o que, por quê).
3. Comandos executados e resultado **real** (números de testes passando/falhando/pulados; saída resumida).
4. O que NÃO foi validado e por quê.
5. Alterações de contrato (se houve) e dependências introduzidas.
6. Riscos, dúvidas e pendências.

Nunca escrever "testes OK" sem rodar. Nunca declarar mock/fixture como integração real. Se algo não pôde ser feito, marcar **NÃO EXECUTADO** ou **INVIÁVEL** com motivo.
