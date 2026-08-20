export class Router {
  constructor(onChange) {
    this.onChange = onChange;
    this.handleChange = this.handleChange.bind(this);
  }

  start() {
    window.addEventListener('hashchange', this.handleChange);
    if (!location.hash) location.replace('#/home');
    else this.handleChange();
  }

  stop() { window.removeEventListener('hashchange', this.handleChange); }

  navigate(path, data = null) {
    if (data !== null) history.state && history.replaceState({ ...history.state, routeData: data }, '');
    location.hash = path.startsWith('#') ? path.slice(1) : path;
  }

  back(fallback = '/home') {
    if (history.length > 1) history.back();
    else this.navigate(fallback);
  }

  handleChange() {
    const raw = location.hash.slice(1) || '/home';
    const [path, queryString = ''] = raw.split('?');
    this.onChange({ path, query: new URLSearchParams(queryString) });
  }
}
