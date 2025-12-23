// Feature Card Slider for Mobile (max-width: 480px)
document.addEventListener('DOMContentLoaded', function () {
    const grid = document.querySelector('.features-grid');
    if (!grid) return;
    if (window.innerWidth > 480) return;

    const cards = Array.from(grid.children);
    let current = 0;

    // Create arrows
    const leftArrow = document.createElement('button');
    leftArrow.className = 'slider-arrow slider-arrow-left';
    leftArrow.innerHTML = '&#8592;';
    const rightArrow = document.createElement('button');
    rightArrow.className = 'slider-arrow slider-arrow-right';
    rightArrow.innerHTML = '&#8594;';

    // Place arrows inside the grid (card area)
    grid.appendChild(leftArrow);
    grid.appendChild(rightArrow);

    function updateSlider() {
        grid.style.transform = `translateX(-${current * 100}vw)`;
    }

    leftArrow.onclick = function () {
        current = (current - 1 + cards.length) % cards.length;
        updateSlider();
    };
    rightArrow.onclick = function () {
        current = (current + 1) % cards.length;
        updateSlider();
    };

    // Ensure grid is at the right position on load
    updateSlider();
});
