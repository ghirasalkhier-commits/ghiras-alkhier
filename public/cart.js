const Cart = {
    get key() {
        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            return currentUser && currentUser.email ? `ghiras_cart_${currentUser.email}` : 'ghiras_cart';
        } catch (e) {
            return 'ghiras_cart';
        }
    },

    getItems() {
        const items = localStorage.getItem(this.key);
        return items ? JSON.parse(items) : [];
    },

        saveItems(items) {
        localStorage.setItem(this.key, JSON.stringify(items));
        this.updateCartCount();
        this.renderCart();

        // Background sync to DB
        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            if (currentUser && currentUser.email) {
                fetch(`/api/cart/${currentUser.email}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: items })
                }).catch(e => console.error("Cart sync error", e));
            }
        } catch(e) {}
    },

    add(product, event) {
        const items = this.getItems();
        const existingItem = items.find(item => item.name === product.name);

        if (existingItem) {
            if (product.stock !== undefined && existingItem.quantity + 1 > product.stock) {
                this.showToast('Sorry, insufficient stock available!', true);
                return;
            }
            existingItem.quantity += 1;
        } else {
            if (product.stock !== undefined && product.stock < 1) {
                this.showToast('Sorry, this product is currently out of stock!', true);
                return;
            }
            items.push({
                ...product,
                quantity: 1
            });
        }

        this.saveItems(items);

        if (event) {
            this.animateAddToCart(event);
        }
    },

    animateAddToCart(event) {
        const button = event.target.closest('button');
        if (!button) return;

        let sourceImage;

        // Strategy 1: Look for image in the same card (Index/Profile page)
        // We look for parent containers with specific classes used in the grid
        const card = button.closest('.bg-surface-light, .bg-surface-dark, .group');
        if (card) {
            sourceImage = card.querySelector('img');
        }

        // Strategy 2: If no card image found, look for main product image (Product page)
        // The product page has a large image at the top
        if (!sourceImage) {
            sourceImage = document.querySelector('.h-\\[55vh\\] img, main img');
        }

        if (!sourceImage) return;

        const cartBtn = document.getElementById('nav-cart-btn');
        if (!cartBtn) return;

        // Create clone
        const clone = sourceImage.cloneNode(true);
        const rect = sourceImage.getBoundingClientRect();
        const cartRect = cartBtn.getBoundingClientRect();

        // Style clone
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.borderRadius = '50%';
        clone.style.zIndex = '1000';
        clone.style.pointerEvents = 'none';
        clone.style.transition = 'all 0.8s ease-in-out';

        document.body.appendChild(clone);

        // Animate
        requestAnimationFrame(() => {
            clone.style.left = (cartRect.left + cartRect.width / 4) + 'px';
            clone.style.top = (cartRect.top + cartRect.height / 4) + 'px';
            clone.style.width = '20px'; // Shrink to dot size
            clone.style.height = '20px';
            clone.style.opacity = '0';
        });

        // Cleanup
        setTimeout(() => {
            clone.remove();
            // Pulse the cart button
            cartBtn.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.2)' },
                { transform: 'scale(1)' }
            ], {
                duration: 300,
                easing: 'ease-out'
            });
        }, 700);
    },

    remove(name) {
        let items = this.getItems();
        items = items.filter(item => item.name !== name);
        this.saveItems(items);
    },

    updateQuantity(name, change) {
        const items = this.getItems();
        const item = items.find(item => item.name === name);

        if (item) {
            if (change > 0 && item.stock !== undefined && item.quantity + change > item.stock) {
                this.showToast('Sorry, insufficient stock available!', true);
                return;
            }
            item.quantity += change;
            if (item.quantity < 1) {
                this.remove(name);
                return;
            }
            this.saveItems(items);
        }
    },

    updateCartCount() {
        const items = this.getItems();
        const count = items.reduce((sum, item) => sum + item.quantity, 0);

        // Update all cart badges
        document.querySelectorAll('.cart-badge').forEach(badge => {
            if (count > 0) {
                badge.classList.remove('hidden');
                badge.innerText = count;
                // Add bounce animation
                badge.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.2)' },
                    { transform: 'scale(1)' }
                ], { duration: 200 });
            } else {
                badge.classList.add('hidden');
            }
        });
    },

    renderCart() {
        const cartPanel = document.getElementById('cart-panel');
        if (!cartPanel) return; // Not on a page with a cart modal

        const cartContent = document.getElementById('cart-items-container');
        if (!cartContent) return;

        const items = this.getItems();

        if (items.length === 0) {
            cartContent.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-slate-500">
                    <span class="material-symbols-outlined text-4xl mb-2">shopping_bag</span>
                    <p>Your cart is empty</p>
                </div>
            `;
            this.updateTotals(items);
            return;
        }

        cartContent.innerHTML = items.map(item => `
            <div class="group bg-surface-light rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-4 transition-all hover:shadow-md">
                <div class="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                    <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image}" />
                </div>
                <div class="flex-1 flex flex-col justify-between py-1">
                    <div>
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold text-slate-900 leading-tight">${item.name}</h3>
                            <button onclick="Cart.remove('${item.name}')" class="text-slate-400 hover:text-red-500 transition-colors">
                                <span class="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        </div>
                        <p class="text-xs text-slate-500 mt-1 italic">${item.description || ''}</p>
                    </div>
                    <div class="flex items-end justify-between mt-2">
                        <p class="font-bold text-primary text-lg">JOD ${item.price.toFixed(2)}</p>
                        <div class="flex items-center bg-slate-100 rounded-full p-1 h-8">
                            <button onclick="Cart.updateQuantity('${item.name}', -1)" class="w-7 h-full flex items-center justify-center text-slate-600 hover:bg-white rounded-full transition-colors">
                                <span class="material-symbols-outlined text-[16px]">remove</span>
                            </button>
                            <span class="w-8 text-center text-sm font-semibold text-slate-900 quantity-display">${item.quantity}</span>
                            <button onclick="Cart.updateQuantity('${item.name}', 1)" class="w-7 h-full flex items-center justify-center bg-primary text-white rounded-full shadow-sm hover:brightness-110 transition-all">
                                <span class="material-symbols-outlined text-[16px]">add</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        this.updateTotals(items);
    },

    updateTotals(items) {
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        // Shipping and tax are currently hidden in UI, so we shouldn't charge them
        const shipping = 0;
        const tax = 0;
        const total = subtotal + shipping + tax;

        const subtotalEl = document.getElementById('cart-subtotal');
        if (subtotalEl) {
            subtotalEl.innerText = 'JOD ' + subtotal.toFixed(2);

            const shippingEl = document.getElementById('cart-shipping');
            if (shippingEl) shippingEl.innerText = 'JOD ' + shipping.toFixed(2);

            const taxEl = document.getElementById('cart-tax');
            if (taxEl) taxEl.innerText = 'JOD ' + tax.toFixed(2);

            const totalEl = document.getElementById('cart-total');
            if (totalEl) totalEl.innerText = 'JOD ' + total.toFixed(2);
        }
    },

    showToast(message, isError = false) {
        // Create the top toast matching checkout.html design
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 opacity-0 pointer-events-none translate-y-[-20px]';
        
        const card = document.createElement('div');
        card.className = 'bg-[#fbf9f8] border border-[#f5f3f3] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] rounded-2xl px-6 py-4 flex items-center gap-3';
        
        const iconBox = document.createElement('div');
        const bgColor = isError ? 'bg-red-500' : 'bg-[#135c38]';
        iconBox.className = `w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgColor} shadow-sm`;
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined text-white text-xl';
        iconSpan.textContent = isError ? 'error' : 'check';
        
        const messageP = document.createElement('p');
        messageP.className = 'text-[#3d4943] font-semibold text-sm m-0 whitespace-nowrap';
        messageP.textContent = message;

        iconBox.appendChild(iconSpan);
        card.appendChild(iconBox);
        card.appendChild(messageP);
        toast.appendChild(card);
        
        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            // small delay to allow DOM to register
            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-[-20px]');
                toast.classList.add('opacity-100', 'translate-y-0');
            });
        });

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', 'translate-y-[-20px]');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    Cart.renderCart();
    Cart.updateCartCount();
});


window.toggleCart = function() {
    const modal = document.getElementById('cart-modal');
    const backdrop = document.getElementById('cart-backdrop');
    const panel = document.getElementById('cart-panel');

    if (!modal) return;

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        // Re-render cart to ensure latest items are shown when opened
        Cart.renderCart(); 
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            panel.classList.remove('translate-y-full');
        }, 10);
    } else {
        backdrop.classList.add('opacity-0');
        panel.classList.add('translate-y-full');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};
