// Minimal slider for feature cards on mobile
// Only activates on screens <= 480px

// Improved slider for feature cards on mobile
// Ensures only one card is visible, no horizontal scroll, arrows at card edges

document.addEventListener('DOMContentLoaded', function () {
  const grid = document.querySelector('.features-grid');
  if (!grid) return;
  const cards = Array.from(grid.children);
  if (cards.length < 2) return;

  function isMobile() {
    return window.innerWidth <= 480;
  }

  let current = 0;
  let sliderActive = false;
  let leftBtn, rightBtn;

  function showCard(idx) {
    cards.forEach((card, i) => {
      card.style.display = i === idx ? 'block' : 'none';
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
    grid.parentNode.style.position = 'relative';
    grid.parentNode.appendChild(leftBtn);
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
    cards.forEach(card => { card.style.display = ''; });
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
