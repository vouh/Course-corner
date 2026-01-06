/**
 * Custom Select Component for Mobile
 * Replaces native select dropdowns with styled custom dropdowns
 * Especially useful for mobile where native selects are too large
 */

class CustomSelect {
    constructor(selectElement, options = {}) {
        this.select = selectElement;
        this.options = {
            mobileOnly: options.mobileOnly !== false, // Only activate on mobile by default
            mobileBreakpoint: options.mobileBreakpoint || 768,
            ...options
        };

        this.isOpen = false;
        this.wrapper = null;
        this.trigger = null;
        this.dropdown = null;

        // Check if should initialize
        if (this.shouldInitialize()) {
            this.init();
        }

        // Re-check on resize
        window.addEventListener('resize', () => this.handleResize());
    }

    shouldInitialize() {
        if (!this.options.mobileOnly) return true;
        return window.innerWidth <= this.options.mobileBreakpoint;
    }

    handleResize() {
        const shouldBeActive = this.shouldInitialize();
        const isActive = this.wrapper !== null;

        if (shouldBeActive && !isActive) {
            this.init();
        } else if (!shouldBeActive && isActive) {
            this.destroy();
        }
    }

    init() {
        // Don't initialize twice
        if (this.wrapper) return;

        // Create wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'custom-select-wrapper';

        // Create trigger button
        this.trigger = document.createElement('div');
        this.trigger.className = 'custom-select-trigger';
        this.trigger.innerHTML = `
            <span class="selected-text">${this.getSelectedText()}</span>
            <span class="arrow"></span>
        `;

        // Create dropdown
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'custom-select-dropdown';
        this.populateDropdown();

        // Insert wrapper
        this.select.parentNode.insertBefore(this.wrapper, this.select);
        this.wrapper.appendChild(this.trigger);
        this.wrapper.appendChild(this.dropdown);
        this.wrapper.appendChild(this.select);

        // Hide original select visually but keep for form submission
        this.select.style.position = 'absolute';
        this.select.style.opacity = '0';
        this.select.style.pointerEvents = 'none';
        this.select.style.height = '0';
        this.select.style.overflow = 'hidden';

        // Bind events
        this.bindEvents();
    }

    getSelectedText() {
        const selected = this.select.options[this.select.selectedIndex];
        return selected ? selected.text : 'Select';
    }

    populateDropdown() {
        this.dropdown.innerHTML = '';

        Array.from(this.select.options).forEach((option, index) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option';
            optionEl.dataset.value = option.value;
            optionEl.dataset.index = index;

            if (option.value === '') {
                optionEl.textContent = 'Clear Grade';
                optionEl.classList.add('placeholder');
            } else {
                optionEl.textContent = option.text;
            }

            if (index === this.select.selectedIndex) {
                optionEl.classList.add('selected');
            }

            this.dropdown.appendChild(optionEl);
        });
    }

    bindEvents() {
        // Toggle dropdown on trigger click
        this.trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Handle option click
        this.dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.custom-select-option');
            if (option) {
                this.selectOption(option);
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });

        // Sync if select changes programmatically
        this.select.addEventListener('change', () => {
            this.updateTriggerText();
            this.updateSelectedOption();
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.wrapper.classList.add('open');

        // Scroll selected option into view
        const selected = this.dropdown.querySelector('.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    close() {
        this.isOpen = false;
        this.wrapper.classList.remove('open');
    }

    selectOption(optionEl) {
        const index = parseInt(optionEl.dataset.index);
        const value = optionEl.dataset.value;

        // Update native select
        this.select.selectedIndex = index;
        this.select.value = value;

        // Trigger change event on the original select
        this.select.dispatchEvent(new Event('change', { bubbles: true }));

        // Update UI
        this.updateTriggerText();
        this.updateSelectedOption();

        // Close dropdown
        this.close();
    }

    updateTriggerText() {
        const textEl = this.trigger.querySelector('.selected-text');
        textEl.textContent = this.getSelectedText();
    }

    updateSelectedOption() {
        // Remove previous selection
        this.dropdown.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Add selection to current
        const currentOption = this.dropdown.querySelector(`[data-index="${this.select.selectedIndex}"]`);
        if (currentOption) {
            currentOption.classList.add('selected');
        }
    }

    destroy() {
        if (!this.wrapper) return;

        // Restore original select
        this.select.style.position = '';
        this.select.style.opacity = '';
        this.select.style.pointerEvents = '';
        this.select.style.height = '';
        this.select.style.overflow = '';

        // Move select out of wrapper
        this.wrapper.parentNode.insertBefore(this.select, this.wrapper);

        // Remove wrapper
        this.wrapper.remove();

        this.wrapper = null;
        this.trigger = null;
        this.dropdown = null;
    }
}

/**
 * Initialize custom selects for grade dropdowns
 */
function initCustomSelects() {
    // Target grade selects specifically
    const gradeSelects = document.querySelectorAll('.grade-select, .cc-grade-select');

    gradeSelects.forEach(select => {
        // Skip if already initialized
        if (select.dataset.customSelectInit) return;
        select.dataset.customSelectInit = 'true';

        new CustomSelect(select, {
            mobileOnly: true,
            mobileBreakpoint: 768
        });
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomSelects);
} else {
    initCustomSelects();
}

// Re-initialize if new selects are added dynamically
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            initCustomSelects();
        }
    });
});

observer.observe(document.body, { childList: true, subtree: true });

// Export for manual usage
window.CustomSelect = CustomSelect;
window.initCustomSelects = initCustomSelects;

console.log('📋 Custom Select component loaded');
