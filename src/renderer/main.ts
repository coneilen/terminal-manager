import './styles/app.css';
import App from './App.svelte';

const targetEl = document.getElementById('app');
if (targetEl) {
  new App({ target: targetEl });
}

export {};
