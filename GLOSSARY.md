# manager-mangas

Acompanha mangás em várias fontes da web, descobre capítulos novos e os baixa.

## Language

**Mangá**:
Obra acompanhada pelo sistema, independente de onde é lida.
_Avoid_: obra, título

**Conector**:
Integração com um site-fonte de mangás (ex.: wicomix, mangeek).
_Avoid_: plugin, engine

**Link de conector**:
Associação de um mangá a uma obra específica dentro de um conector; um mangá pode ter vários.
_Avoid_: mangaConnector, fonte do mangá

**Catálogo**:
Lista de obras disponíveis num conector, guardada localmente e renovada periodicamente.

**Descoberta de capítulos**:
Consulta aos links ativos de um mangá para registrar capítulos ainda desconhecidos.
_Avoid_: buscar capítulos, update de capítulos

**Volume**:
Número que identifica um capítulo dentro do mangá; dois links nunca registram o mesmo volume.
_Avoid_: número do capítulo

**Primeira fonte a responder**:
Regra de precedência: quando vários links trazem o mesmo volume, fica o do link cuja resposta chegou primeiro.
_Avoid_: prioridade de conector, ordem alfabética
