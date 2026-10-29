import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'

const root = document.getElementById('app')!
// The server puts the agent page text in #app for fetch tools that get HTML; the UI replaces it.
root.textContent = ''
render(<App />, root)
