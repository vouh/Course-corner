// Initialize Swiper for mobile only
window.addEventListener('DOMContentLoaded', function () {
  if (window.innerWidth > 480) return;
  new Swiper('.swiper', {
    slidesPerView: 1,
    spaceBetween: 0,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    loop: false,
    allowTouchMove: true,
  });
});
