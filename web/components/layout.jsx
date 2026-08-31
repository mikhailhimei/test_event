function AppHeader({ proxy }) {
  const statusText = proxy.running ? `mitmproxy: порт ${proxy.port}` : 'mitmproxy остановлен';

  return (
    <header>
      <div>
        <h1>Mobile Traffic Check</h1>
        <p>Проверка мобильного трафика</p>
      </div>
      <span className={proxy.running ? 'online' : 'offline'}>{statusText}</span>
    </header>
  );
}

function TabMenu({ activeTab, setActiveTab, menuOpen, setMenuOpen }) {
  return (
    <div className={`menu ${menuOpen ? 'open' : ''}`}>
      <button className="burger" onClick={() => setMenuOpen(!menuOpen)}>
        ☰ Меню
      </button>
      <nav className="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TabPanel({ children }) {
  return <section className="tab-panel active">{children}</section>;
}

function Card({ children, className = '' }) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

function TitleRow({ title, children }) {
  return (
    <div className="title-row">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ResultRow({ label, value, className = '' }) {
  return (
    <div className={`result-block-row ${className}`.trim()}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Modal({ children, onClose }) {
  const closeOnBackdrop = (event) => {
    if (event.target.className === 'modal-backdrop') onClose();
  };

  return (
    <div className="modal-backdrop" onClick={closeOnBackdrop}>
      <div className="modal">{children}</div>
    </div>
  );
}
