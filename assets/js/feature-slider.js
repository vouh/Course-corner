// Minimal slider for feature cards on mobile
// Only activates on screens <= 480px

document.addEventListener('DOMContentLoaded', function () {
  const grid = document.querySelector('.features-grid');
  if (!grid) return;
  const cards = Array.from(grid.children);
  if (cards.length < 2) return;

  // Only activate slider on mobile
  function isMobile() {
    return window.innerWidth <= 480;
  }

  let current = 0;
  let sliderActive = false;
  let leftBtn, rightBtn;

  function showCard(idx) {
    cards.forEach((card, i) => {
      card.style.display = i === idx ? 'block' : 'none';
      card.style.width = '100%';
      card.style.margin = '0 auto';
    });
    if (leftBtn) leftBtn.disabled = idx === 0;
    if (rightBtn) rightBtn.disabled = idx === cards.length - 1;
  }

  function createArrows() {
    leftBtn = document.createElement('button');
    rightBtn = document.createElement('button');
    leftBtn.innerHTML = '&#8592;';
    rightBtn.innerHTML = '&#8594;';
    leftBtn.className = 'slider-arrow left-arrow';
    rightBtn.className = 'slider-arrow right-arrow';
    leftBtn.onclick = () => { if (current > 0) { current--; showCard(current); } };
    rightBtn.onclick = () => { if (current < cards.length - 1) { current++; showCard(current); } };
    grid.parentNode.insertBefore(leftBtn, grid);
    grid.parentNode.appendChild(rightBtn);
  }

  function destroyArrows() {
    if (leftBtn) leftBtn.remove();
    if (rightBtn) rightBtn.remove();
    leftBtn = rightBtn = null;
  }

  function activateSlider() {
    if (sliderActive) return;
    createArrows();
    showCard(current);
    sliderActive = true;
  }

  function deactivateSlider() {
    cards.forEach(card => { card.style.display = ''; card.style.width = ''; card.style.margin = ''; });
    destroyArrows();
    sliderActive = false;
    current = 0;
  }

  function handleResize() {
    if (isMobile()) {
      activateSlider();
    } else {
      deactivateSlider();
    }
  }

  window.addEventListener('resize', handleResize);
  handleResize();
});
