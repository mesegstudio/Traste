/* ============================================================
   Clases y oído. Las clases explican en dos o tres minutos lo que un profesor cuenta de palabra:
   teoría de acordes, ritmo, técnica de las dos manos y el mástil. Cada una se puede escuchar
   (la app toca los ejemplos) y termina con un ejercicio para practicarla.
   Bloques: ['p', html] · ['h', título] · ['hear', etiqueta, qué suena] · ['chords', [ids]] ·
   ['neck', {from, to, marks}] · ['tab', texto] · ['tip', html] · ['list', [html]] ·
   ['strum', patrón] · ['quiz', pregunta, [opciones], correcta, explicación]
   ============================================================ */
const mk = (string, fret, label, finger = 0) => ({ string, fret, finger, st: 'show', label, midi: stringMidi(string) + fret });
const CLASS_GROUPS = ['Para empezar', 'Acordes', 'Mano derecha', 'Punteo y mástil'];
const CLASSES = [
  // ---------------- Para empezar ----------------
  { id: 'guitarra', group: 'Para empezar', lvl: 1, min: 2, title: 'La guitarra por dentro', sub: 'Cuerdas, trastes y cómo se numeran',
    blocks: [
      ['p', 'La guitarra tiene <b>seis cuerdas</b>. Se numeran de la más fina a la más gruesa, así que la 1ª es la fina y aguda, y la 6ª la gruesa y grave. Con la guitarra en las piernas, la 6ª te queda arriba, la más cerca de la cara.'],
      ['p', 'Las barritas de metal del mástil son los <b>trastes</b>. Se cuentan desde la cabeza de la guitarra, donde están las clavijas. Cuando un diagrama dice «traste 2» quiere decir el hueco entre la primera barrita y la segunda.'],
      ['neck', { from: 0, to: 5, marks: [mk(6, 0, 'Mi'), mk(5, 0, 'La'), mk(4, 0, 'Re'), mk(3, 0, 'Sol'), mk(2, 0, 'Si'), mk(1, 0, 'Mi')] }],
      ['p', 'Al aire, sin pisar nada, las cuerdas suenan Mi, La, Re, Sol, Si y Mi, de la 6ª a la 1ª. Apréndetelo de memoria, porque todo lo demás sale de ahí.'],
      ['hear', 'Las seis cuerdas al aire', { notes: [40, 45, 50, 55, 59, 64], gap: 0.55 }],
      ['tip', 'Una frase para recordarlas de la gruesa a la fina: «<b>Mi</b> <b>La</b>ura <b>Re</b>gala <b>Sol</b>o <b>Si</b>etemesinos <b>Mi</b>mosos». Vale cualquiera que te inventes.'],
      ['quiz', '¿Cuál es la 6ª cuerda?', ['La más fina', 'La más gruesa', 'La del medio'], 1, 'La 6ª es la gruesa y la más grave. Al tocar te queda arriba.'],
    ], practice: [['Tocar las cuerdas al aire', '#aprender/ej/open']] },
  { id: 'afinar', group: 'Para empezar', lvl: 1, min: 2, title: 'Afinar antes de tocar', sub: 'Por qué importa y cómo se hace',
    blocks: [
      ['p', 'Una guitarra desafinada suena mal aunque pongas bien los dedos, y además te acostumbra el oído a notas que no son. Afina <b>cada vez que cojas la guitarra</b>. Se tarda un minuto.'],
      ['p', 'Cada cuerda se afina con su clavija. Al apretarla la nota sube y al aflojarla baja. Toca la cuerda al aire, mira la aguja del afinador y gira despacio hasta que quede en el centro.'],
      ['list', ['Si la nota está <b>grave</b>, aprieta la clavija.', 'Si está <b>aguda</b>, afloja hasta quedarte por debajo y vuelve a subir. Llegar a la nota apretando hace que la cuerda aguante más tiempo afinada.', 'Toca la cuerda una sola vez y déjala sonar. Si la machacas, la aguja no para quieta.']],
      ['tip', 'Las cuerdas nuevas se desafinan mucho los primeros días. Es normal, van cediendo hasta asentarse.'],
    ], practice: [['Abrir el afinador', '#afinador']] },
  { id: 'postura', group: 'Para empezar', lvl: 1, min: 2, title: 'Postura y cómo pisar', sub: 'Lo que evita que suene mal y que te duela',
    blocks: [
      ['p', 'Siéntate con la espalda recta y apoya la guitarra en la pierna. El mástil apunta un poco hacia arriba. No lo sujetes con la mano que pisa, porque esa mano tiene que quedar libre para moverse.'],
      ['h', 'La mano que pisa'],
      ['list', ['Pisa con la <b>punta del dedo</b>, no con la yema plana.', 'Coloca el dedo <b>justo detrás del traste</b>, pegado a la barrita de metal pero sin subirte a ella. Ahí hace falta menos fuerza y la nota sale limpia.', 'Arquea los dedos, como si sujetaras una pelota pequeña, para no rozar las cuerdas de al lado.', 'El pulgar va <b>detrás del mástil</b>, más o menos frente al dedo medio.']],
      ['h', 'Si una nota suena mal'],
      ['p', 'Cuando una cuerda <b>zumba</b>, casi siempre es que el dedo está lejos del traste o aprieta poco. Cuando <b>no suena</b> o se apaga enseguida, algún dedo la está rozando o no llega a pisarla del todo.'],
      ['tip', 'Las yemas duelen la primera semana y luego se endurecen. Mejor diez minutos cada día que una hora de golpe.'],
      ['quiz', '¿Dónde se coloca el dedo al pisar?', ['Encima de la barrita de metal', 'En mitad del hueco', 'Justo detrás de la barrita'], 2, 'Pegado al traste por detrás. Es donde menos fuerza hace falta.'],
    ], practice: [['Probar cómo suenan tus notas', '#ajustes']] },
  { id: 'leer', group: 'Para empezar', lvl: 1, min: 3, title: 'Leer diagramas y tablaturas', sub: 'Los dos dibujos que vas a ver en todas partes',
    blocks: [
      ['p', 'Un <b>diagrama de acorde</b> es una foto del mástil. Las líneas son cuerdas y trastes, cada punto es un dedo y su número dice cuál (1 índice, 2 medio, 3 anular, 4 meñique). Una <b>O</b> es una cuerda al aire y una <b>✕</b> una cuerda que no se toca.'],
      ['chords', ['Am']],
      ['p', 'Una <b>tablatura</b> enseña una melodía. Tiene seis líneas, una por cuerda, con la <b>1ª arriba y la 6ª abajo</b>. Los números son trastes y se leen de izquierda a derecha, como un texto. Un 0 es la cuerda al aire.'],
      ['tab', 'e|-----------------0---|\nB|-------------1-------|\nG|---------0-----------|\nD|-----2---------------|\nA|-3-------------------|\nE|---------------------|'],
      ['p', 'Ahí se toca primero el traste 3 de la 5ª cuerda, después el 2 de la 4ª, la 3ª al aire, el 1 de la 2ª y la 1ª al aire. Son las notas de un acorde de Do, una detrás de otra.'],
      ['hear', 'Así suena esa tablatura', { notes: [48, 52, 55, 60, 64], gap: 0.45 }],
      ['tip', 'Cuando dos números están uno encima del otro, se tocan a la vez.'],
      ['quiz', 'En una tablatura, ¿qué cuerda es la línea de abajo?', ['La 1ª, la fina', 'La 6ª, la gruesa'], 1, 'La tablatura se dibuja como ves la guitarra al tocar: la gruesa abajo.'],
    ], practice: [['Una canción en nivel Fácil', '#canciones']] },
  { id: 'pulso', group: 'Para empezar', lvl: 1, min: 3, title: 'El pulso y el compás', sub: 'Contar es la mitad de tocar',
    blocks: [
      ['p', 'Toda la música lleva un <b>pulso</b>, el golpe regular con el que mueves el pie sin pensarlo. Los pulsos se agrupan en <b>compases</b>, casi siempre de cuatro, y por eso se cuenta «1, 2, 3, 4» una y otra vez.'],
      ['p', 'Una nota que dura un pulso entero es una <b>negra</b>. Si en cada pulso caben dos notas, son <b>corcheas</b>, y se cuentan metiendo una «y» entre los números.'],
      ['strum', [[0, 'D'], [1, 'D'], [2, 'D'], [3, 'D']]],
      ['hear', 'Cuatro negras', { strums: 'Em', pattern: [[0, 'D'], [1, 'D'], [2, 'D'], [3, 'D']], bpm: 80 }],
      ['strum', [[0, 'D'], [0.5, 'U'], [1, 'D'], [1.5, 'U'], [2, 'D'], [2.5, 'U'], [3, 'D'], [3.5, 'U']]],
      ['hear', 'Ocho corcheas', { strums: 'Em', pattern: [[0, 'D'], [0.5, 'U'], [1, 'D'], [1.5, 'U'], [2, 'D'], [2.5, 'U'], [3, 'D'], [3.5, 'U']], bpm: 80 }],
      ['p', 'La velocidad del pulso se mide en <b>pulsos por minuto</b> (ppm). A 60 ppm hay un pulso por segundo. Una balada va por 70 y una canción movida por 120.'],
      ['tip', 'Cuenta en voz alta mientras tocas. Parece una tontería y es lo que más ayuda a no perderse.'],
    ], practice: [['Rasgueo en negras', '#aprender/ej/strum4']] },
  // ---------------- Acordes ----------------
  { id: 'acorde', group: 'Acordes', lvl: 1, min: 3, title: 'Qué es un acorde', sub: 'Tres notas que suenan bien juntas',
    blocks: [
      ['p', 'Un acorde son varias notas que suenan a la vez. Los básicos tienen solo <b>tres notas distintas</b>. En la guitarra se repiten en varias cuerdas, y por eso rasgueas cinco o seis cuerdas aunque las notas sean tres.'],
      ['p', 'Esas tres notas salen de una escala cogiendo una sí y otra no. De la escala de Do (Do Re Mi Fa Sol La Si) se cogen <b>Do, Mi y Sol</b>, y eso es el acorde de Do mayor.'],
      ['hear', 'Do, Mi y Sol, de una en una', { notes: [48, 52, 55], gap: 0.6 }],
      ['hear', 'Las tres a la vez', { chord: 'C' }],
      ['chords', ['C']],
      ['p', 'La nota que da nombre al acorde es la <b>tónica</b>. Las otras dos son la <b>tercera</b> y la <b>quinta</b>, porque son la tercera y la quinta nota contando desde la tónica.'],
      ['tip', 'La tónica suele ser la nota más grave del acorde. Por eso en Do no se toca la 6ª cuerda, que daría un Mi por debajo.'],
      ['quiz', '¿Cuántas notas distintas tiene un acorde básico?', ['Dos', 'Tres', 'Seis'], 1, 'Tres: tónica, tercera y quinta. En la guitarra se repiten en varias cuerdas.'],
    ], practice: [['Aprender el acorde de Do', '#aprender/acorde/C']] },
  { id: 'mayormenor', group: 'Acordes', lvl: 1, min: 3, title: 'Mayor y menor', sub: 'Una sola nota cambia el carácter',
    blocks: [
      ['p', 'Los acordes <b>mayores</b> suenan abiertos y alegres. Los <b>menores</b>, más oscuros y tristes. Toda la diferencia está en la tercera, que en el menor baja un traste.'],
      ['hear', 'La mayor y La menor', { cmp: ['A', 'Am'] }],
      ['chords', ['A', 'Am']],
      ['p', 'Compara los dos dibujos. Solo cambia el dedo de la 2ª cuerda, que pasa del traste 2 al 1. Esa nota es la tercera del acorde.'],
      ['hear', 'Mi mayor y Mi menor', { cmp: ['E', 'Em'] }],
      ['p', 'Un acorde menor se escribe con una «m» detrás, como Lam o Mim. Si no lleva nada, es mayor.'],
      ['tip', 'Las canciones mezclan los dos tipos. Los menores no son «los tristes», son los que dan contraste.'],
      ['quiz', '¿Qué nota cambia entre un acorde mayor y su menor?', ['La tónica', 'La tercera', 'La quinta'], 1, 'La tercera baja un traste y el acorde pasa a menor.'],
    ], practice: [['Entrenar el oído: ¿mayor o menor?', '#aprender/oido/mm']] },
  { id: 'septima', group: 'Acordes', lvl: 2, min: 2, title: 'Los acordes de séptima', sub: 'El acorde que pide seguir',
    blocks: [
      ['p', 'Un acorde de <b>séptima</b> lleva una cuarta nota. Suena con tensión, como una frase a medias, y el oído espera que vaya a otro acorde que la resuelva.'],
      ['hear', 'Mi7 deja la frase abierta', { chord: 'E7' }],
      ['hear', 'Mi7 y después La, que la cierra', { chords: ['E7', 'A'], gap: 1.3 }],
      ['chords', ['E7', 'A']],
      ['p', 'Por eso las séptimas aparecen justo antes de volver al acorde principal. Si7 lleva a Mi, Mi7 lleva a La, La7 lleva a Re, Re7 lleva a Sol y Sol7 lleva a Do.'],
      ['tip', 'En muchas canciones puedes cambiar un acorde mayor por su séptima justo antes del cambio y suena más a blues.'],
    ], practice: [['Aprender Mi7', '#aprender/acorde/E7'], ['Cambios Mi7 ↔ La7', '#aprender/cambios/E7~A7']] },
  { id: 'tonalidad', group: 'Acordes', lvl: 2, min: 3, title: 'Por qué siempre salen los mismos acordes', sub: 'Las familias de acordes',
    blocks: [
      ['p', 'Cada canción está en una <b>tonalidad</b>, que es su acorde de casa. Dentro de una tonalidad casi todo se toca con cuatro acordes: el primero, el cuarto y el quinto de su escala, que son mayores, y el sexto, que es menor.'],
      ['p', 'En la tonalidad de Sol, esos cuatro son <b>Sol, Do, Re y Mim</b>. Con ellos se tocan miles de canciones.'],
      ['hear', 'Sol, Re, Mim y Do', { chords: ['G', 'D', 'Em', 'C'], gap: 1.1 }],
      ['chords', ['G', 'D', 'Em', 'C']],
      ['h', 'Las familias más cómodas en guitarra'],
      ['list', ['En <b>Sol</b> se usan Sol, Do, Re y Mim.', 'En <b>Do</b>, Do, Fa, Sol y Lam.', 'En <b>Re</b>, Re, Sol, La y Sim.', 'En <b>La</b>, La, Re, Mi y Fa#m.', 'En <b>Mi</b>, Mi, La, Si7 y Do#m.']],
      ['p', 'Si una canción empieza en Sol y aparece un Re, lo más probable es que el siguiente sea Do o Mim. Saberlo te ayuda a sacar canciones de oído y a recordar los acordes.'],
      ['tip', 'El primer acorde y el último de una canción suelen ser el de casa.'],
      ['quiz', 'En la tonalidad de Do, ¿qué acorde menor es de la familia?', ['Lam', 'Mim', 'Rem'], 0, 'El sexto de la escala de Do es La, y es menor. Mim y Rem también existen en Do, pero se usan menos.'],
    ], practice: [['Rasgueo con Sol, Mim, Do y Re', '#aprender/ej/strumPop']] },
  { id: 'cambiar', group: 'Acordes', lvl: 1, min: 3, title: 'Cambiar de acorde sin parar', sub: 'Los trucos que usan todos los guitarristas',
    blocks: [
      ['p', 'Lo difícil de los acordes no es ponerlos, es <b>llegar a tiempo</b> al siguiente. Estas cuatro ideas acortan mucho el camino.'],
      ['list', ['<b>Dedo guía.</b> Si un dedo se queda en la misma cuerda, no lo levantes, deslízalo. Entre Re y La el índice sigue en la 3ª cuerda.', '<b>Dedo pivote.</b> Si un dedo no cambia de sitio, déjalo apoyado y mueve los demás alrededor. Entre Do y Lam se quedan dos dedos quietos.', '<b>Todos a la vez.</b> Al principio se colocan los dedos de uno en uno. Practica despacio hasta que salgan del acorde y caigan en el otro como un bloque.', '<b>Mira hacia delante.</b> Piensa en el acorde siguiente un tiempo antes de que llegue.']],
      ['chords', ['C', 'Am']],
      ['p', 'Mientras cambias, la mano del rasgueo <b>no para</b>. Si no llegas, rasguea igual aunque el acorde no esté puesto del todo. Mantener el ritmo importa más que una nota suelta.'],
      ['tip', 'El ejercicio que más ayuda son los cambios de un minuto: dos acordes, un rasgueo en cada uno y contar cuántos haces. Con 30 cambios por minuto ya puedes tocar canciones lentas.'],
    ], practice: [['Cambios de un minuto', '#aprender/ej/changes'], ['Cambios cada dos tiempos', '#aprender/ej/chg2']] },
  { id: 'cejilla', group: 'Acordes', lvl: 3, min: 3, title: 'La cejilla', sub: 'La postiza y la del dedo índice',
    blocks: [
      ['h', 'La cejilla postiza'],
      ['p', 'La pinza que se pone en el mástil sube todas las cuerdas a la vez. Con ella tocas las formas que ya sabes y suenan más agudas. En el traste 2, la forma de Sol suena como La.'],
      ['p', 'Sirve para adaptar una canción a tu voz sin aprender acordes nuevos. Si te queda grave, pon la cejilla y sube trastes hasta que te resulte cómoda.'],
      ['h', 'La cejilla con el dedo'],
      ['p', 'Hace lo mismo con el índice, tumbado sobre todas las cuerdas de un traste. Así una sola forma vale para cualquier tono, porque basta con moverla por el mástil. Fa y Sim son las primeras que aparecen.'],
      ['chords', ['F', 'Bm']],
      ['list', ['Usa el <b>canto del índice</b>, el lado que mira al pulgar, que es más duro que la yema.', 'Pégalo al traste por detrás, como cualquier dedo.', 'El pulgar aprieta desde atrás, a la altura del índice, como una pinza.', 'Baja el codo y acerca la guitarra al cuerpo. La fuerza sale del brazo, no solo de la mano.']],
      ['tip', 'Nadie la saca limpia el primer mes. Practícala un poco cada día en el traste 5, donde cuesta menos, y ve bajando hacia el traste 1.'],
    ], practice: [['Fuerza de cejilla', '#aprender/ej/barre'], ['Fa fácil, sin cejilla entera', '#aprender/acorde/F_easy']] },
  // ---------------- Mano derecha ----------------
  { id: 'rasgueo', group: 'Mano derecha', lvl: 1, min: 3, title: 'Cómo se rasguea', sub: 'El brazo como un péndulo',
    blocks: [
      ['p', 'El secreto del rasgueo es que <b>el brazo no para nunca</b>. Baja en cada pulso y sube entre uno y otro, como un péndulo. A veces toca las cuerdas y a veces pasa por el aire, pero el movimiento sigue igual.'],
      ['list', ['El movimiento sale del <b>codo</b> y la muñeca va suelta.', 'Hacia <b>abajo</b> se tocan todas las cuerdas del acorde. Hacia <b>arriba</b>, solo las tres o cuatro más finas.', 'Las subidas van más suaves que las bajadas.']],
      ['h', 'El patrón más usado'],
      ['strum', [[0, 'D'], [1, 'D'], [1.5, 'U'], [2.5, 'U'], [3, 'D'], [3.5, 'U']]],
      ['hear', 'Abajo, abajo-arriba, arriba-abajo-arriba', { strums: 'G', pattern: [[0, 'D'], [1, 'D'], [1.5, 'U'], [2.5, 'U'], [3, 'D'], [3.5, 'U']], bpm: 84, bars: 2 }],
      ['p', 'Se cuenta «1, 2 y, y 4 y». En el tiempo 3 el brazo baja sin tocar. Ese golpe en el aire es lo que le da el balanceo, y si lo quitas y paras el brazo pierdes el pulso.'],
      ['tip', 'Apréndelo primero con las cuerdas tapadas con la otra mano, solo el ritmo. Cuando salga solo, añade el acorde.'],
    ], practice: [['Rasgueo en corcheas', '#aprender/ej/strum8'], ['El rasgueo más usado', '#aprender/ej/strumPop']] },
  { id: 'pua', group: 'Mano derecha', lvl: 1, min: 2, title: 'La púa', sub: 'Cómo cogerla y la púa alterna',
    blocks: [
      ['p', 'La púa se sujeta entre la <b>yema del pulgar y el lado del índice</b>, con la punta asomando solo dos o tres milímetros. Si asoma mucho se engancha en las cuerdas, y si la aprietas demasiado el sonido sale duro.'],
      ['p', 'Para tocar notas sueltas se usa la <b>púa alterna</b>, un golpe hacia abajo y el siguiente hacia arriba, siempre alternando. Es el doble de rápido que tocar todo hacia abajo, porque aprovechas el viaje de vuelta.'],
      ['list', ['El movimiento es pequeño y sale de la muñeca.', 'Apoya el canto de la mano en el puente, sin apretar, para tener una referencia.', 'Abajo y arriba deben sonar igual de fuerte.']],
      ['tip', 'Empieza muy despacio y con metrónomo. La velocidad llega sola cuando el movimiento es regular.'],
    ], practice: [['Púa alterna en las cuerdas al aire', '#aprender/ej/alt1']] },
  { id: 'dedos', group: 'Mano derecha', lvl: 2, min: 3, title: 'Tocar con los dedos', sub: 'Pulgar, índice, medio y anular',
    blocks: [
      ['p', 'Sin púa, cada dedo tiene su trabajo. Se nombran con una letra, <b>p</b> el pulgar, <b>i</b> el índice, <b>m</b> el medio y <b>a</b> el anular.'],
      ['list', ['El <b>pulgar</b> toca los bajos, que son las cuerdas 6ª, 5ª y 4ª.', 'El <b>índice</b> toca la 3ª cuerda.', 'El <b>medio</b>, la 2ª.', 'El <b>anular</b>, la 1ª.']],
      ['p', 'Un <b>arpegio</b> es tocar las notas de un acorde de una en una. El más sencillo es p-i-m-a: el bajo del acorde con el pulgar y después las cuerdas 3ª, 2ª y 1ª.'],
      ['hear', 'Arpegio p-i-m-a sobre La menor', { notes: [45, 57, 60, 64, 45, 57, 60, 64], gap: 0.36 }],
      ['chords', ['Am']],
      ['tip', 'Deja la mano quieta sobre las cuerdas y mueve solo los dedos. Cada dedo se queda cerca de su cuerda y no hace falta mirar.'],
    ], practice: [['Arpegio p-i-m-a', '#aprender/ej/pima'], ['Una canción en nivel Arpegio', '#canciones']] },
  // ---------------- Punteo y mástil ----------------
  { id: 'notas', group: 'Punteo y mástil', lvl: 1, min: 3, title: 'Las notas del mástil', sub: 'Doce notas y una regla',
    blocks: [
      ['p', 'En la música hay <b>doce notas</b> que se repiten. Siete tienen nombre propio (Do, Re, Mi, Fa, Sol, La, Si) y entre ellas hay cinco intermedias, los sostenidos (#).'],
      ['p', 'En la guitarra, <b>cada traste sube una nota</b> de esas doce. Entre casi todas las notas con nombre hay un traste de por medio, salvo entre <b>Mi y Fa</b> y entre <b>Si y Do</b>, que van seguidas.'],
      ['neck', { from: 0, to: 12, marks: [mk(6, 0, 'Mi'), mk(6, 1, 'Fa'), mk(6, 3, 'Sol'), mk(6, 5, 'La'), mk(6, 7, 'Si'), mk(6, 8, 'Do'), mk(6, 10, 'Re'), mk(6, 12, 'Mi')] }],
      ['hear', 'Las notas de la 6ª cuerda', { notes: [40, 41, 43, 45, 47, 48, 50, 52], gap: 0.42 }],
      ['list', ['En el <b>traste 12</b> la cuerda vuelve a dar su nota al aire, una octava más aguda. A partir de ahí todo se repite.', 'El <b>traste 5</b> de una cuerda suena igual que la cuerda siguiente al aire. La única excepción es la 3ª cuerda, que lo hace en el traste 4.']],
      ['tip', 'Empieza por la 6ª y la 5ª cuerda. Son las que dan nombre a los acordes con cejilla.'],
      ['quiz', '¿Qué nota hay en el traste 1 de la 6ª cuerda?', ['Fa', 'Fa sostenido', 'Sol'], 0, 'La 6ª al aire es Mi, y de Mi a Fa no hay traste de por medio.'],
    ], practice: [['Notas de la 6ª cuerda', '#aprender/ej/find6']] },
  { id: 'escala', group: 'Punteo y mástil', lvl: 2, min: 3, title: 'La escala mayor', sub: 'De dónde salen las melodías y los acordes',
    blocks: [
      ['p', 'Una <b>escala</b> es una selección de notas que suenan bien juntas. La mayor tiene siete y es la del «Do Re Mi Fa Sol La Si». Casi todas las melodías que conoces están hechas con una escala mayor.'],
      ['p', 'Lo que la define son las distancias entre sus notas. Un <b>tono</b> son dos trastes y un <b>semitono</b>, uno. La escala mayor sigue siempre el mismo orden: tono, tono, semitono, tono, tono, tono, semitono.'],
      ['neck', { from: 0, to: 4, marks: [mk(5, 3, 'Do', 3), mk(4, 0, 'Re'), mk(4, 2, 'Mi', 2), mk(4, 3, 'Fa', 3), mk(3, 0, 'Sol'), mk(3, 2, 'La', 2), mk(2, 0, 'Si'), mk(2, 1, 'Do', 1)] }],
      ['hear', 'Do mayor', { notes: [48, 50, 52, 53, 55, 57, 59, 60], gap: 0.4 }],
      ['p', 'Empieza la misma receta en otra nota y tienes otra escala mayor. Desde Sol sale Sol mayor, con un Fa sostenido, que es lo que hace falta para respetar las distancias.'],
      ['tip', 'Los acordes de una tonalidad se construyen con las notas de su escala. Por eso la escala de Do y los acordes Do, Fa y Sol encajan siempre.'],
    ], practice: [['Escala de Do mayor', '#aprender/ej/cmaj'], ['Do mayor de tres en tres', '#aprender/ej/scale3']] },
  { id: 'penta', group: 'Punteo y mástil', lvl: 2, min: 2, title: 'La pentatónica', sub: 'Cinco notas para improvisar',
    blocks: [
      ['p', 'La <b>pentatónica menor</b> es una escala de solo cinco notas. Es la más usada en el rock y el blues, porque casi cualquier combinación de esas notas suena bien.'],
      ['p', 'Su dibujo más conocido se toca en el traste 5 y tiene dos notas por cuerda. El índice se queda en el traste 5, el anular toca el 7 y el meñique el 8.'],
      ['neck', { from: 4, to: 9, marks: [mk(6, 5, 'La', 1), mk(6, 8, '', 4), mk(5, 5, '', 1), mk(5, 7, '', 3), mk(4, 5, '', 1), mk(4, 7, 'La', 3), mk(3, 5, '', 1), mk(3, 7, '', 3), mk(2, 5, '', 1), mk(2, 8, '', 4), mk(1, 5, 'La', 1), mk(1, 8, '', 4)] }],
      ['hear', 'Pentatónica menor de La', { notes: [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72], gap: 0.3 }],
      ['p', 'Suena bien sobre canciones en La menor y también en Do mayor. Moviendo el mismo dibujo a otro traste cambia de tono: en el traste 7 es la de Si, y en el 3, la de Sol.'],
      ['tip', 'Para improvisar no hace falta correr. Toca tres o cuatro notas, para, y repite la idea cambiando el final.'],
    ], practice: [['Pentatónica menor de La', '#aprender/ej/penta']] },
  { id: 'ligados', group: 'Punteo y mástil', lvl: 2, min: 3, title: 'Ligados', sub: 'Notas que suenan sin volver a pulsar',
    blocks: [
      ['p', 'Un <b>ligado</b> es una nota que suena sin que la mano derecha la toque. La hace la mano del mástil, y da un sonido más suave y rápido que pulsar cada nota.'],
      ['h', 'Martillo'],
      ['p', 'Pulsas una nota y, sin volver a pulsar, dejas caer otro dedo con decisión sobre un traste más alto de la misma cuerda. El dedo golpea como un martillo, cerca del traste y con la punta.'],
      ['h', 'Tirón'],
      ['p', 'Es lo contrario. Con dos dedos puestos en la misma cuerda, pulsas y retiras el dedo de arriba tirando un poco de la cuerda hacia abajo, como si la pellizcaras. Suena la nota del dedo que queda.'],
      ['tab', 'e|---------------------|\nB|---------------------|\nG|--5h7---5h7---7p5----|\nD|---------------------|\nA|---------------------|\nE|---------------------|'],
      ['p', 'En las tablaturas el martillo se escribe con una <b>h</b> y el tirón con una <b>p</b>.'],
      ['tip', 'Además de sonar bien, los ligados son el mejor ejercicio de fuerza para los dedos. La segunda nota tiene que oírse igual que la primera.'],
    ], practice: [['Martillos', '#aprender/ej/hammer'], ['Tirones', '#aprender/ej/pull']] },
  { id: 'limpio', group: 'Punteo y mástil', lvl: 1, min: 2, title: 'Tocar limpio', sub: 'Por qué zumba o se apaga una nota',
    blocks: [
      ['p', 'Una nota limpia suena clara y aguanta. Cuando no sale así, casi siempre es por una de estas tres cosas.'],
      ['list', ['<b>Zumba</b> (trastea). El dedo está lejos del traste o aprieta poco y la cuerda roza con el metal. Acércalo a la barrita.', '<b>Se apaga enseguida.</b> El dedo no llega a pisar del todo, o lo levantas antes de tiempo. Mantén la presión hasta la nota siguiente.', '<b>No suena.</b> Otro dedo la está tocando. Arquea más los dedos y pisa con la punta.']],
      ['p', 'No hace falta apretar con toda la fuerza. Prueba a pisar una nota y aflojar poco a poco hasta que empiece a zumbar. Un pelín más que eso es la presión justa. Con menos fuerza te cansas menos y cambias más rápido.'],
      ['tip', 'En Ajustes tienes «Probar la escucha». Toca una nota y te dice si ha sonado limpia y cuánto ha aguantado.'],
    ], practice: [['Araña 1-2-3-4, despacio', '#aprender/ej/spider5'], ['Probar la escucha', '#ajustes']] },
  { id: 'practicar', group: 'Para empezar', lvl: 1, min: 2, title: 'Cómo practicar', sub: 'Para avanzar con poco tiempo',
    blocks: [
      ['list', ['<b>Poco y cada día.</b> Quince minutos diarios hacen más que dos horas el domingo. Las manos aprenden mientras descansas.', '<b>Despacio y limpio.</b> Si lo tocas rápido y sucio, eso es lo que aprendes. Baja la velocidad hasta que salga bien y súbela de cinco en cinco pulsos.', '<b>Con metrónomo.</b> Te obliga a no parar en lo difícil y te enseña dónde fallas.', '<b>Lo difícil, aparte.</b> Si una canción se atasca en dos compases, repite solo esos dos hasta que salgan y vuelve a la canción.', '<b>Acaba con algo que te guste.</b> Una canción al final de cada sesión es lo que hace que vuelvas mañana.']],
      ['p', 'La práctica de hoy sigue ese orden: afinar, calentar los dedos, algo nuevo, cambios, ritmo y una canción. Si un día solo tienes cinco minutos, haz el calentamiento y la canción.'],
      ['tip', 'Si te duele la mano o la muñeca, para. Las yemas se endurecen, pero un dolor en la muñeca es señal de tensión o mala postura.'],
    ], practice: [['Ver la práctica de hoy', '#aprender']] },
];
const CLI = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
const classRead = (id) => !!store.get('read', {})[id];

const Classes = {
  id: null, quiz: {},
  open(id) { this.id = id; this.quiz = {}; },
  play(spec) {
    AudioEngine.ensure();
    const N = (id) => chordNotes(CHORDS[id]);
    if (spec.notes) spec.notes.forEach((m, i) => AudioEngine.pluck(midiToFreq(m), i * (spec.gap || 0.4), 0.5));
    else if (spec.chord) AudioEngine.strum(N(spec.chord), 'D');
    else if (spec.chords) spec.chords.forEach((c, i) => AudioEngine.strum(N(c), 'D', i * (spec.gap || 1)));
    else if (spec.cmp) spec.cmp.forEach((c, i) => AudioEngine.strum(N(c), 'D', i * 1.5));
    else if (spec.strums) { const spb = 60 / (spec.bpm || 80); for (let b = 0; b < (spec.bars || 1); b++) for (const [t, dir] of spec.pattern) AudioEngine.strum(chordNotes(CHORDS[spec.strums], dir), dir, (b * 4 + t) * spb); }
  },
  blockHTML(b, i) {
    const [t, x, y, z, w] = b;
    if (t === 'p') return `<p>${x}</p>`;
    if (t === 'h') return `<h3>${x}</h3>`;
    if (t === 'tip') return `<div class="tip">${icon('lightbulb-line')}<span>${x}</span></div>`;
    if (t === 'list') return `<ul class="cl-list">${x.map((li) => `<li>${li}</li>`).join('')}</ul>`;
    if (t === 'hear') return `<button type="button" class="btn btn-soft cl-hear" data-cl-hear="${i}">${icon('volume-up-line')}${x}</button>`;
    if (t === 'chords') return `<div class="cl-chords">${x.map((id) => `<div class="diagram sm">${chordDiagram(CHORDS[id])}<b>${chordLabel(id)}</b></div>`).join('')}</div>`;
    if (t === 'neck') return `<div class="neck-wrap cl-neck">${neckSVG({ from: x.from, to: x.to, marks: x.marks.map((m) => ({ ...m, label: m.label && LATIN.includes(m.label) ? pcName(m.midi) : m.label })) })}</div>`;
    if (t === 'tab') return `<pre class="cl-tab">${esc(x)}</pre>`;
    if (t === 'strum') return `<div class="rh-pattern cl-strum">${[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((s, k) => { const p = x.find(([o]) => o === s); return `<span class="${p ? p[1] : 'rest'}"><i>${p ? icon(p[1] === 'D' ? 'arrow-down-line' : 'arrow-up-line') : '·'}</i><em>${k % 2 ? 'y' : k / 2 + 1}</em></span>`; }).join('')}</div>`;
    if (t === 'quiz') {
      const got = this.quiz[i];
      return `<div class="cl-quiz ${got == null ? '' : got === z ? 'ok' : 'bad'}"><b>${x}</b><div class="cl-opts">${y.map((o, k) => `<button type="button" class="chip ${got != null && k === z ? 'right' : got === k ? 'wrong' : ''}" data-cl-quiz="${i}" data-k="${k}" ${got != null ? 'disabled' : ''}>${o}</button>`).join('')}</div>${got == null ? '' : `<p>${got === z ? '¡Eso es! ' : 'No. '}${w}</p>`}</div>`;
    }
    return '';
  },
  html() {
    const c = CLI[this.id], list = CLASSES, idx = list.indexOf(c), nx = list.slice(idx + 1).find((q) => !classRead(q.id));
    return `<div class="screen class">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="${Learn.inRoutine ? '#aprender' : '#aprender/clases'}" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1>${c.title}</h1><p>${c.group} · ${c.min} min${classRead(c.id) ? ' · <span style="color:var(--ok)">leída</span>' : ''}</p></div>
      </div>
      <div class="scr-body scroll"><article class="cl-body">
        <p class="cl-sub">${c.sub}</p>
        ${c.blocks.map((b, i) => this.blockHTML(b, i)).join('')}
        <div class="cl-end">
          <h3>Practícalo</h3>
          <div class="cl-acts">${c.practice.map(([l, h], k) => `<a class="btn ${k ? 'btn-soft' : 'btn-primary'}" href="${h}" data-cl-done>${l}${icon('arrow-right-line')}</a>`).join('')}</div>
          <div class="cl-acts">${nx ? `<a class="btn btn-ghost" href="#aprender/clase/${nx.id}" data-cl-done>Siguiente clase: ${nx.title}</a>` : ''}<button type="button" class="btn btn-ghost" data-cl-done data-cl-back>${icon('check-line')}Entendido</button></div>
        </div>
      </article></div>
    </div>`;
  },
  done() {
    const r = store.get('read', {}); if (!r[this.id]) { r[this.id] = true; store.set('read', r); }
    Learn.markDone('class:' + this.id);
  },
  onClick(e) {
    const h = e.target.closest('[data-cl-hear]');
    if (h) { this.play(CLI[this.id].blocks[+h.dataset.clHear][2]); return; }
    const q = e.target.closest('[data-cl-quiz]');
    if (q) { this.quiz[+q.dataset.clQuiz] = +q.dataset.k; const y = $('#learn .scroll')?.scrollTop; Learn.render(); const sc = $('#learn .scroll'); if (sc) sc.scrollTop = y; return; }
    const d = e.target.closest('[data-cl-done]');
    if (d) {
      this.done();
      if (d.dataset.clBack != null) { const nx = Learn.nextAction('class:' + this.id); if (nx) nx.fn(); else location.hash = Learn.inRoutine ? '#aprender' : '#aprender/clases'; }
    }
  },
};

/* ============================================================
   Oído: la app toca y tú eliges. Diez preguntas por partida, sin micrófono.
   ============================================================ */
const EAR_GAMES = [
  { id: 'high', lvl: 1, icon: 'music-line', title: '¿Cuál es más aguda?', sub: 'Dos notas, una detrás de otra', why: 'Suenan dos notas. Di si la segunda es más aguda o más grave que la primera. Al principio están lejos y poco a poco se acercan.' },
  { id: 'mm', lvl: 1, icon: 'hand', title: '¿Mayor o menor?', sub: 'El carácter de un acorde', why: 'Suena un acorde. Los mayores suenan abiertos y alegres, y los menores más oscuros. Con un poco de práctica se distinguen sin pensar.' },
  { id: 'chord', lvl: 2, icon: 'question-line', title: '¿Qué acorde suena?', sub: 'Entre los acordes que ya sabes', why: 'Suena uno de tus acordes aprendidos y eliges cuál es. Fíjate en la nota más grave y en si es mayor o menor.' },
  { id: 'string', lvl: 1, icon: 'focus-3-line', title: '¿Qué cuerda es?', sub: 'Las seis cuerdas al aire, de oído', why: 'Suena una cuerda al aire y dices cuál. Es el primer paso para afinar de oído.' },
];
const EARI = Object.fromEntries(EAR_GAMES.map((g) => [g.id, g]));
const earStars = (v) => (v >= 9 ? 3 : v >= 7 ? 2 : v >= 5 ? 1 : 0);
const EarGame = {
  g: null, st: 'idle', n: 0, score: 0, q: null, picked: null,
  open(id) { this.g = EARI[id]; this.st = 'idle'; this.q = null; },
  pool() {
    const learned = CHORD_ORDER.filter((x) => state.learned[x] && !CHORDS[x].variant);
    return learned.length >= 3 ? learned : ['Em', 'Am', 'E', 'A', 'D'];
  },
  rand(a) { return a[Math.floor(Math.random() * a.length)]; },
  next() {
    const id = this.g.id, N = (c) => chordNotes(CHORDS[c]);
    this.picked = null; this.n++;
    if (id === 'mm') {
      const [maj, min] = this.rand([['A', 'Am'], ['E', 'Em'], ['D', 'Dm']]), isMin = Math.random() < 0.5;
      this.q = { play: () => AudioEngine.strum(N(isMin ? min : maj), 'D'), opts: ['Mayor', 'Menor'], ok: isMin ? 1 : 0, reveal: chordLabel(isMin ? min : maj) };
    } else if (id === 'chord') {
      const pool = this.pool(), c = this.rand(pool), opts = [c, ...pool.filter((x) => x !== c).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
      this.q = { play: () => AudioEngine.strum(N(c), 'D'), opts: opts.map((x) => chordLabel(x)), ok: opts.indexOf(c), reveal: chordLabel(c) };
    } else if (id === 'string') {
      const s = 1 + Math.floor(Math.random() * 6);
      this.q = { play: () => AudioEngine.pluck(midiToFreq(stringMidi(s)), 0, 0.55), opts: [6, 5, 4, 3, 2, 1].map((k) => `${k}ª · ${pcName(stringMidi(k))}`), ok: 6 - s, reveal: `la ${s}ª, ${pcName(stringMidi(s))}` };
    } else {
      // la distancia se acorta según aciertas: de una octava a un semitono
      const gap = [12, 9, 7, 5, 4, 3, 2, 2, 1, 1][Math.min(9, this.score)], a = 52 + Math.floor(Math.random() * 10), up = Math.random() < 0.5, b = a + (up ? gap : -gap);
      this.q = { play: () => { AudioEngine.pluck(midiToFreq(a), 0, 0.5); AudioEngine.pluck(midiToFreq(b), 0.7, 0.5); }, opts: ['Más aguda', 'Más grave'], ok: up ? 0 : 1, reveal: `${pcName(a)} y después ${pcName(b)}` };
    }
    Learn.render();
    setTimeout(() => { if (this.st === 'run' && this.picked == null) this.q.play(); }, 350);
  },
  start() { AudioEngine.ensure(); this.st = 'run'; this.n = 0; this.score = 0; this.next(); },
  pick(k) {
    if (this.picked != null) return;
    this.picked = k; if (k === this.q.ok) this.score++;
    Learn.render();
  },
  advance() {
    if (this.n >= 10) return this.finish();
    this.next();
  },
  finish() {
    const key = 'ear:' + this.g.id, prev = state.rec[key], v = this.score, stars = earStars(v);
    state.rec[key] = { v: Math.max(v, prev?.v || 0), stars: Math.max(stars, prev?.stars || 0) }; store.set('rec', state.rec);
    this.st = 'idle'; Learn.markDone('ear:' + this.g.id); Learn.render();
    const acts = [{ label: 'Otra partida', icon: 'restart-line', fn: () => this.start() }];
    const nxt = Learn.nextAction('ear:' + this.g.id); if (nxt) acts.push(nxt);
    acts[acts.length - 1].kind = 'primary';
    showResult({ stars, title: starsLine(stars), text: v >= 9 ? 'Tienes buen oído para esto.' : 'El oído se entrena igual que los dedos, con un poco cada día.', big: [[`${v}/10`, 'aciertos'], ...(prev ? [[`${prev.v}/10`, 'tu mejor partida']] : [])], actions: acts });
  },
  html() {
    const g = this.g, run = this.st === 'run', q = this.q, rec = state.rec['ear:' + g.id];
    const stage = !run ? `<div class="ear-idle">${icon('headphone-line')}<p>Diez preguntas. Sube el volumen o ponte los auriculares.</p></div>`
      : `<div class="ear-q">
          <div class="ear-n">Pregunta ${this.n} de 10 · ${this.score} ${this.score === 1 ? 'acierto' : 'aciertos'}</div>
          <button type="button" class="btn btn-soft btn-lg ear-play" data-ear="play">${icon('volume-up-line')}Escuchar otra vez</button>
          <div class="ear-opts n${q.opts.length}">${q.opts.map((o, k) => `<button type="button" class="ear-opt ${this.picked != null && k === q.ok ? 'right' : this.picked === k ? 'wrong' : ''}" data-ear="pick" data-k="${k}" ${this.picked != null ? 'disabled' : ''}>${o}</button>`).join('')}</div>
          ${this.picked == null ? '' : `<div class="ear-res ${this.picked === q.ok ? 'ok' : 'bad'}">${this.picked === q.ok ? '¡Bien!' : 'No era esa.'} Sonaba ${q.reveal}.</div>`}
        </div>`;
    return `<div class="screen drill ear" data-kind="ear">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="${Learn.inRoutine ? '#aprender' : '#aprender/oido'}" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1>${g.title}</h1><p>${g.sub}</p></div>
        <div class="dr-stats">${!run && rec ? `<div class="dr-stat rec">${miniStars(rec.stars)}<b>${rec.v}/10</b><span>tu récord</span></div>` : ''}</div>
      </div>
      ${run ? '' : `<div class="dr-intro"><p class="dr-why">${g.why}</p></div>`}
      <div class="dr-stage">${stage}</div>
      <div class="dr-foot">
        <div class="dr-msg">${run ? (this.picked == null ? 'Elige lo que has oído.' : '') : ''}</div>
        ${!run ? `<button type="button" class="btn btn-primary btn-lg" data-ear="start">${icon('play-fill')}Empezar</button>` : this.picked != null ? `<button type="button" class="btn btn-primary btn-lg" data-ear="next">${this.n >= 10 ? 'Ver resultado' : 'Siguiente'}${icon('arrow-right-line')}</button>` : `<button type="button" class="btn btn-soft" data-ear="stop">Parar</button>`}
      </div>
    </div>`;
  },
  onClick(b) {
    const a = b.dataset.ear;
    if (a === 'start') this.start();
    if (a === 'play') this.q?.play();
    if (a === 'pick') this.pick(+b.dataset.k);
    if (a === 'next') this.advance();
    if (a === 'stop') { this.st = 'idle'; Learn.render(); }
  },
};
