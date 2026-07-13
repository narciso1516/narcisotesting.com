const form = document.getElementById('diagnosticForm');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const report = document.getElementById('report');
    const toast = document.getElementById('toast');
    const STORAGE_KEY = 'diagnostico_heder_omar_v1';

    function getFieldNames(){
      return [...new Set([...form.elements].filter(el => el.name).map(el => el.name))];
    }

    function serializeForm(){
      const data = {};
      getFieldNames().forEach(name => {
        const fields = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
        if(!fields.length) return;
        if(fields[0].type === 'radio'){
          const checked = fields.find(f => f.checked);
          data[name] = checked ? checked.value : '';
        } else {
          data[name] = fields[0].value || '';
        }
      });
      return data;
    }

    function restoreForm(){
      try{
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        Object.entries(saved).forEach(([name,value]) => {
          const fields = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
          if(!fields.length) return;
          if(fields[0].type === 'radio'){
            const target = fields.find(f => f.value === value);
            if(target) target.checked = true;
          }else{
            fields[0].value = value;
          }
        });
      }catch(e){}
      updateProgress();
    }

    function saveForm(showMessage=true){
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeForm()));
      if(showMessage) showToast('Progreso guardado en este dispositivo');
    }

    function showToast(message){
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(window.toastTimer);
      window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
    }

    function updateProgress(){
      const names = getFieldNames();
      const data = serializeForm();
      const completed = names.filter(n => String(data[n] || '').trim() !== '').length;
      const pct = Math.round((completed / names.length) * 100);
      progressBar.style.width = pct + '%';
      progressText.textContent = `Progreso: ${pct}%`;
    }

    form.addEventListener('input', () => {
      updateProgress();
      saveForm(false);
    });
    form.addEventListener('change', () => {
      updateProgress();
      saveForm(false);
    });

    document.getElementById('saveProgress').addEventListener('click', () => saveForm(true));

    document.querySelectorAll('[data-say]').forEach(btn => {
      let count = 0;
      btn.addEventListener('click', () => {
        if(!('speechSynthesis' in window)){
          showToast('El audio no está disponible en este navegador');
          return;
        }
        if(count >= 3){
          showToast('Ya se reprodujo tres veces; puedes continuar con calma');
          return;
        }
        count++;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(btn.dataset.say);
        utterance.lang = 'en-US';
        utterance.rate = 0.82;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
        btn.textContent = `▶ Escuchar (${count}/3)`;
      });
    });

    function calculateResults(){
      const questions = [...document.querySelectorAll('.question.scored')];
      const domains = {};
      let correct = 0;
      let explored = 0;
      let unsure = 0;

      questions.forEach(q => {
        const domain = q.dataset.domain;
        if(!domains[domain]) domains[domain] = {correct:0, explored:0, total:0, unsure:0};
        domains[domain].total++;

        const checked = q.querySelector('input[type="radio"]:checked');
        if(!checked) return;
        if(checked.value === '__unsure__'){
          unsure++;
          domains[domain].unsure++;
          return;
        }
        explored++;
        domains[domain].explored++;
        if(checked.dataset.correct === 'true'){
          correct++;
          domains[domain].correct++;
        }
      });

      const easeNames = ['ease_grammar','ease_reading','ease_listening','ease_production'];
      const easeValues = easeNames
        .map(n => form.querySelector(`input[name="${n}"]:checked`))
        .filter(Boolean)
        .map(el => Number(el.value));
      const easeAvg = easeValues.length ? easeValues.reduce((a,b)=>a+b,0)/easeValues.length : null;

      const prefScores = {};
      document.querySelectorAll('input[data-pref]:checked').forEach(el => {
        const key = el.dataset.pref;
        prefScores[key] = (prefScores[key] || 0) + Number(el.value);
      });

      return {
        questions, domains, correct, explored, unsure,
        total: questions.length,
        pct: explored ? Math.round(correct / explored * 100) : null,
        easeAvg,
        prefScores
      };
    }

    function domainLabel(pct, explored){
      if(!explored) return 'No explorado';
      if(pct >= 75) return 'Se muestra accesible';
      if(pct >= 45) return 'En desarrollo';
      return 'Conviene acompañar';
    }

    function generateReport(){
      saveForm(false);
      const r = calculateResults();

      document.getElementById('metricScore').textContent = r.pct === null ? 'Sin datos' : r.pct + '%';
      document.getElementById('metricExplored').textContent = `${r.explored} de ${r.total}`;
      document.getElementById('metricConfidence').textContent =
        r.easeAvg === null ? 'Sin datos' : `${r.easeAvg.toFixed(1)} de 5`;

      const domainBars = document.getElementById('domainBars');
      domainBars.innerHTML = '';

      const resultsList = Object.entries(r.domains).map(([name,d]) => {
        const pct = d.explored ? Math.round(d.correct/d.explored*100) : 0;
        return {name, ...d, pct};
      });

      resultsList.forEach(d => {
        const row = document.createElement('div');
        row.className = 'domain-row';
        row.innerHTML = `
          <div class="domain-title">
            <span>${d.name}</span>
            <strong>${domainLabel(d.pct,d.explored)}${d.explored ? ` · ${d.pct}%` : ''}</strong>
          </div>
          <div class="bar"><span style="width:${d.explored ? d.pct : 0}%"></span></div>
        `;
        domainBars.appendChild(row);
      });

      const strengths = resultsList.filter(d => d.explored && d.pct >= 75).map(d => d.name);
      const support = resultsList.filter(d => d.explored && d.pct < 60).map(d => d.name);
      const unexplored = resultsList.filter(d => !d.explored).map(d => d.name);

      document.getElementById('strengthsText').textContent =
        strengths.length ? strengths.join(', ') + '.' :
        'Todavía no aparece un área claramente consolidada; conviene observar las producciones abiertas.';

      let supportText = support.length ? support.join(', ') + '.' : 'No se detectó un área prioritaria entre los reactivos respondidos.';
      if(unexplored.length) supportText += ` Quedó por explorar: ${unexplored.join(', ')}.`;
      document.getElementById('supportText').textContent = supportText;

      const prefEntries = Object.entries(r.prefScores).sort((a,b)=>b[1]-a[1]);
      if(prefEntries.length){
        const max = prefEntries[0][1];
        const top = prefEntries.filter(([,score]) => score === max).map(([name]) => name);
        document.getElementById('preferenceText').textContent =
          `Se observa mayor afinidad por recursos de tipo ${top.join(' y ').toLowerCase()}. Conviene combinarlos con otras formas de práctica.`;
      }else{
        document.getElementById('preferenceText').textContent =
          'Completa la sección de preferencias para obtener una orientación.';
      }

      let recommendation = 'Iniciar con actividades breves, modeladas y con opción de repetir.';
      if(support.includes('Escucha')) recommendation += ' Usar audios cortos, velocidad lenta y apoyo visual.';
      if(support.includes('Lectura')) recommendation += ' Trabajar textos pequeños con palabras clave y preguntas literales.';
      if(support.some(s => ['Pasado simple','Pasado de to be','There was / There were','Conectores'].includes(s))){
        recommendation += ' Reforzar el pasado mediante líneas del tiempo, secuencias y experiencias personales.';
      }
      if(support.some(s => ['Comparativos','Superlativos'].includes(s))){
        recommendation += ' Practicar comparaciones con objetos, personas o imágenes cercanas.';
      }
      if(support.includes('Futuro')){
        recommendation += ' Diferenciar planes y predicciones mediante agendas e imágenes del clima.';
      }
      document.getElementById('recommendationText').textContent = recommendation;

      report.classList.add('show');
      setTimeout(() => report.scrollIntoView({behavior:'smooth',block:'start'}), 60);
    }

    document.getElementById('showReport').addEventListener('click', generateReport);

    function makeTextReport(){
      const r = calculateResults();
      const data = serializeForm();
      const domainLines = Object.entries(r.domains).map(([name,d]) => {
        const pct = d.explored ? Math.round(d.correct/d.explored*100) : null;
        return `- ${name}: ${pct === null ? 'No explorado' : pct + '%'} (${d.explored} reactivos respondidos)`;
      }).join('\n');

      const prefEntries = Object.entries(r.prefScores).sort((a,b)=>b[1]-a[1]);
      const prefText = prefEntries.length ? prefEntries.map(([k,v])=>`${k}: ${v}`).join(', ') : 'Sin información';

      return `REPORTE DIAGNÓSTICO DE INGLÉS
Estudiante: Heder Omar Rodríguez Vázquez
Carácter: Diagnóstico, sin calificación

RESUMEN
Desempeño en reactivos explorados: ${r.pct === null ? 'Sin datos' : r.pct + '%'}
Reactivos académicos respondidos: ${r.explored} de ${r.total}
Respuestas "No lo sé todavía": ${r.unsure}
Facilidad percibida promedio: ${r.easeAvg === null ? 'Sin datos' : r.easeAvg.toFixed(1) + ' de 5'}

PANORAMA POR ÁREA
${domainLines}

PREFERENCIAS
${prefText}
Preferencia de corrección: ${data.correction_pref || 'Sin respuesta'}
Actividades de interés: ${data.activity_interest || 'Sin respuesta'}

PRODUCCIÓN ESCRITA
Presente continuo:
${data.writing_present || 'Sin respuesta'}

Pasado:
${data.writing_past || 'Sin respuesta'}

Futuro:
${data.writing_future || 'Sin respuesta'}

EXPRESIÓN ORAL
${data.speaking_note || 'Sin observación'}

OBSERVACIONES GENERALES
${data.teacher_observations || 'Sin observaciones'}

NOTA
Este reporte orienta la planeación del acompañamiento. No constituye una calificación ni una etiqueta fija de habilidad o estilo de aprendizaje.
`;
    }

    document.getElementById('downloadReport').addEventListener('click', () => {
      const blob = new Blob([makeTextReport()], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Reporte_diagnostico_ingles_Heder_Omar.txt';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('resetForm').addEventListener('click', () => {
      const ok = confirm('¿Deseas borrar todas las respuestas guardadas de este diagnóstico?');
      if(!ok) return;
      form.reset();
      localStorage.removeItem(STORAGE_KEY);
      report.classList.remove('show');
      updateProgress();
      window.scrollTo({top:0,behavior:'smooth'});
      showToast('Diagnóstico reiniciado');
    });

    restoreForm();