import React from 'react';
import { createRoot } from 'react-dom/client';
import ScrapeItApp from './ScrapeItApp.jsx';
import VehicleInventoryPanel from './VehicleInventoryPanel.jsx';
import './scrape-it.css';

createRoot(document.getElementById('root')).render(<><ScrapeItApp /><div className="scrape-it-shell"><main className="si-main"><VehicleInventoryPanel /></main></div></>);
