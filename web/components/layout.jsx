function AppHeader({ proxy }) {
  return <header><div><h1>Mobile Traffic Check</h1><p>Проверка мобильного трафика</p></div><span className={proxy.running ? 'online' : 'offline'}>{proxy.running ? `mitmproxy: порт ${proxy.port}` : 'mitmproxy остановлен'}</span></header>;
}

function TabMenu({ activeTab, setActiveTab, menuOpen, setMenuOpen }) {
  return <div className={`menu ${menuOpen ? 'open' : ''}`}><button className="burger" onClick={() => setMenuOpen(!menuOpen)}>☰ Меню</button><nav className="tabs">{tabs.map(([id, label]) => <button key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>)}</nav></div>;
}

const TabPanel = ({ children }) => <section className="tab-panel active">{children}</section>;
const Card = ({ children, className = '' }) => <div className={`card ${className}`.trim()}>{children}</div>;
const TitleRow = ({ title, children }) => <div className="title-row"><h2>{title}</h2>{children}</div>;
const FormField = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const ResultRow = ({ label, value, className = '' }) => <div className={`result-block-row ${className}`.trim()}><span>{label}</span><span>{value}</span></div>;
const Modal = ({ children, onClose }) => <div className="modal-backdrop" onClick={(event) => event.target.className === 'modal-backdrop' && onClose()}><div className="modal">{children}</div></div>;
