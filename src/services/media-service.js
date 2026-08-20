export function selectCameraPhoto() {
  return chooseFiles({ capture: 'environment', multiple: false });
}

export function selectGalleryPhotos({ multiple = false } = {}) {
  return chooseFiles({ capture: null, multiple });
}

export function selectLogo() {
  return chooseFiles({ accept: 'image/png,image/jpeg,image/webp,image/svg+xml', multiple: false });
}

function chooseFiles({ capture = null, accept = 'image/*', multiple = false }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.append(input);
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      const files = Array.from(input.files ?? []);
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', finish, { once: true });
    window.addEventListener('focus', () => setTimeout(finish, 700), { once: true });
    input.click();
  });
}
