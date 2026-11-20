# manager-mangas

Acompanha mangás em várias fontes da web, descobre capítulos novos e os baixa.

## Language

**Mangá**:
Obra acompanhada pelo sistema, independente de onde é lida.
_Avoid_: obra, título

**Conector**:
Integração com um site-fonte de mangás (ex.: wicomix, mangeek).
_Avoid_: plugin, engine

**Conector desligado**:
Conector posto fora de uso para todos os mangás de uma vez; nada o consulta enquanto estiver assim, e religá-lo devolve cada link ao estado que tinha.
_Avoid_: conector inativo, link inativo

**Link de conector**:
Associação de um mangá a uma obra específica dentro de um conector; um mangá pode ter vários.
_Avoid_: mangaConnector, fonte do mangá

**Catálogo**:
Lista de obras disponíveis num conector, guardada localmente e renovada periodicamente.

**Descoberta de capítulos**:
Consulta aos links ativos de um mangá para registrar capítulos ainda desconhecidos.
_Avoid_: buscar capítulos, update de capítulos

**Carência**:
Tempo, contado da publicação no site-fonte, em que um capítulo novo de um conector ainda não é registrado; serve para não pegar capítulo postado antes da tradução.
_Avoid_: quarentena, delay, atraso

**Volume**:
Número que identifica um capítulo dentro do mangá; dois links nunca registram o mesmo volume.
_Avoid_: número do capítulo

**Primeira fonte a responder**:
Regra de precedência: quando vários links trazem o mesmo volume, fica o do link cuja resposta chegou primeiro.
_Avoid_: prioridade de conector, ordem alfabética
