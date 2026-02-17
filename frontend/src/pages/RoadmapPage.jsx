import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const RoadmapPage = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getScaffoldingRoadmap().then(setData).catch(() => setData(null));
  }, []);

  return (
    <div className="page">
      <div className="page-header"><h1>Roadmap scaffolding</h1></div>
      {!data && <div className="muted">Loading...</div>}
      {data && <pre className="card" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
};

export default RoadmapPage;
