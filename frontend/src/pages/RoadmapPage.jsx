import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';

const RoadmapPage = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getScaffoldingRoadmap().then(setData).catch(() => setData(null));
  }, []);

  return (
    <div className="page">
      <div className="page-header"><h1>{t('pages.roadmap.title')}</h1></div>
      {!data && <div className="muted">{t('common.loading')}</div>}
      {data && (
        <div className="grid-two">
          {Object.entries(data).map(([section, features]) => (
            <section className="card" key={section}>
              <h3 style={{ marginTop: 0 }}>{section}</h3>
              <ul className="list">
                {Object.entries(features).map(([name, status]) => (
                  <li key={name} className="list-item-row">
                    <strong>{name}</strong>
                    <span className="muted">{status}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default RoadmapPage;
