// Feature Card Slider for Mobile (max-width: 480px)
document.addEventListener('DOMContentLoaded', function () {
    const grid = document.querySelector('.features-grid');
    if (!grid) return;
    if (window.innerWidth > 480) return;

    // Wrap cards in a slider container
    grid.classList.add('feature-slider');
    const cards = Array.from(grid.children);
    let current = 0;

    // Create arrows
    const leftArrow = document.createElement('button');
    leftArrow.className = 'slider-arrow slider-arrow-left';
    leftArrow.innerHTML = '&#8592;';
    const rightArrow = document.createElement('button');
    rightArrow.className = 'slider-arrow slider-arrow-right';
    rightArrow.innerHTML = '&#8594;';

    grid.parentNode.insertBefore(leftArrow, grid);
    grid.parentNode.appendChild(rightArrow);

    function updateSlider() {
        cards.forEach((card, i) => {
            card.style.display = i === current ? 'block' : 'none';
        });
    }

    leftArrow.onclick = function () {
        current = (current - 1 + cards.length) % cards.length;
        updateSlider();
    };
    rightArrow.onclick = function () {
        current = (current + 1) % cards.length;
        updateSlider();
    };

    updateSlider();
});
