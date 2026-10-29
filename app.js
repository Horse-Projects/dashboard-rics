function render(){
    let rics = distinct(view);

    // TOTAL DE RICS
    let total = rics.length;

    // SOMA USANDO SOMENTE VALOR RC
    let sum = view.reduce((s,r) => {
        return s + number(r['Valor RC']);
    }, 0);

    let statuses = group(rics,'Status');
    let top = Object.entries(statuses).sort((a,b)=>b[1]-a[1])[0];

    let ordered = rics.filter(r =>
        String(r.Pedido || '').trim()
    ).length;

    $('total').textContent = total;
    $('items').textContent = `${view.length} itens encontrados`;

    // CARD VALOR TOTAL
    $('value').textContent = money(sum);

    // CARD MÉDIA
    $('average').textContent =
        `média ${money(total ? sum/total : 0)}`;

    $('mainStatus').textContent = top?.[0] || '—';
    $('mainStatusSub').textContent =
        top ? `${top[1]} RICs` : 'sem registros';

    $('orders').textContent = ordered;

    $('ordersPct').textContent =
        `${total ? Math.round(ordered/total*100) : 0}% das RICs`;

    let days = rics.map(r=>{
        let s = date(r['Data da solicitação']);

        let ends = [
            'Data Aprov  4 RC',
            'Data Aprov  3 RC',
            'Data Aprov  2 RC',
            'Data Aprov 1 RC'
        ].map(k => date(r[k])).filter(Boolean);

        let e = ends[0];

        return s && e ? (e-s)/864e5 : null;
    }).filter(x=>x>=0 && x<9999);

    $('approval').textContent =
        `${days.length
            ? (days.reduce((a,b)=>a+b,0)/days.length).toFixed(1)
            : 0} dias`;

    // GRÁFICO POR DATA
    let byDate = {};

    rics.forEach(r=>{
        let d = date(r['Data da solicitação']);

        if(d){
            let k = d.toLocaleDateString('pt-BR');
            byDate[k] = (byDate[k] || 0) + 1;
        }
    });

    let dates = Object.keys(byDate).sort((a,b)=>{
        let [da,ma,ya] = a.split('/');
        let [db,mb,yb] = b.split('/');

        return new Date(ya,ma-1,da)
             - new Date(yb,mb-1,db);
    });

    chart(
        'dateChart',
        'line',
        dates,
        dates.map(k=>byDate[k]),
        '#3b82f6',
        {plugins:{legend:{display:false}}}
    );

    // TODOS OS VALORES USANDO "Valor RC"
    let vs = group(view,'Status','Valor RC');

    chart(
        'valueChart',
        'bar',
        Object.keys(vs),
        Object.values(vs),
        ['#10b981','#f59e0b','#ef4444','#8755ef','#06b6d4','#3b82f6'],
        {plugins:{legend:{display:false}}}
    );

    let rq = Object.entries(
        group(view,'Requisitante','Valor RC')
    ).sort((a,b)=>b[1]-a[1]).slice(0,10);

    chart(
        'requesterChart',
        'bar',
        rq.map(x=>x[0]),
        rq.map(x=>x[1]),
        ['#3b82f6','#10b981','#f59e0b','#ef4444','#8755ef','#06b6d4'],
        {plugins:{legend:{display:false}}}
    );

    chart(
        'statusChart',
        'doughnut',
        Object.keys(statuses),
        Object.values(statuses),
        ['#3b82f6','#10b981','#f59e0b','#ef4444','#8755ef','#06b6d4']
    );

    let sp = Object.entries(
        group(view,'Nome','Valor RC')
    ).sort((a,b)=>b[1]-a[1]).slice(0,10);

    let colors = [
        '#8755ef',
        '#06b6d4',
        '#f59e0b',
        '#10b981'
    ];

    $('ranking').innerHTML = sp.length
        ? sp.map((x,i)=>`
            <div class="rank" style="--c:${colors[i%4]}">
                <span>${esc(x[0])}</span>
                <b>${money(x[1])}</b>
            </div>
        `).join('')
        : '<div class="empty">Sem fornecedores</div>';

    table();
}
