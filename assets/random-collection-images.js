const randomImagePools = document.querySelectorAll('[data-random-collection-image]');

randomImagePools.forEach((pool) => {
  const images = [...pool.querySelectorAll('.resource-image__random-image')];
  if (images.length < 2) return;

  const activeImage = images[Math.floor(Math.random() * images.length)];

  images.forEach((image) => image.classList.remove('is-active'));
  activeImage.classList.add('is-active');
});
