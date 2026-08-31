function SettingsTab({ settings, setSettings, saveSettings, proxyInfo, openCertificateFolder }) {
  const updatePath = (value) => {
    const next = { ...settings, requestPath: value };
    setSettings(next);
    saveSettings(next);
  };
  return <TabPanel><Card><ProxyInfo info={proxyInfo} openCertificateFolder={openCertificateFolder} /><FormField label="Путь запроса"><input value={settings.requestPath || ''} placeholder="/api/events или часть URL" onChange={(event) => updatePath(event.target.value)} /></FormField><p className="hint">Пустое поле принимает запросы с любым URL.</p><JsonTransfer title="Сценарии" name="scenarios" data={settings.scenarios} settings={settings} saveSettings={saveSettings} /><JsonTransfer title="Общие элементы" name="commonElements" data={settings.commonElements} settings={settings} saveSettings={saveSettings} /></Card></TabPanel>;
}

function ProxyInfo({ info, openCertificateFolder }) {
  return <section className="proxy-info card"><div className="proxy-info-title">Подключение телефона</div><div className="proxy-info-grid"><span>Хост</span><strong>{info.host}</strong><span>Порт</span><strong>{info.port}</strong><span>Сертификат на ПК</span><code>{info.certificatePath}</code><button className="secondary" type="button" onClick={openCertificateFolder}>Открыть папку</button></div></section>;
}

function JsonTransfer({ title, name, data, settings, saveSettings }) {
  const [text, setText] = React.useState('');
  const [message, setMessage] = React.useState('');
  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify({ [name]: data }, null, 2)], { type: 'application/json' }));
    link.download = `${name}.json`;
    link.click();
  };
  const upload = async () => {
    try {
      const parsed = JSON.parse(text);
      await saveSettings({ ...settings, [name]: Array.isArray(parsed) ? parsed : parsed[name] || [] });
      setMessage(`${title} загружены.`);
    } catch (_) {
      setMessage('Некорректный JSON.');
    }
  };
  return <div className="json-upload-card"><div className="title-row"><h3>{title}</h3><div><button className="secondary" type="button" onClick={download}>Скачать</button> <button className="secondary" type="button" onClick={upload}>Загрузить JSON</button></div></div><textarea rows="6" value={text} onChange={(event) => setText(event.target.value)} placeholder={`{"${name}":[]}`} /><p className="hint">{message}</p></div>;
}
