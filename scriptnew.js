        // Navigation auto-hide/show
        let lastScrollY = window.scrollY;
        let ticking = false;
        const navbar = document.getElementById('navbar');
        
        // Afficher la navbar au début
        navbar.classList.add('initial');
        
        
        function updateNavbar() {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY < 100) {
                navbar.classList.add('initial');
                navbar.classList.remove('visible');
            } else if (currentScrollY < lastScrollY) {
                // Scrolling up
                navbar.classList.remove('initial');
                navbar.classList.add('visible');
            } else if (currentScrollY > lastScrollY) {
                // Scrolling down
                navbar.classList.remove('initial', 'visible');
            }
            
            lastScrollY = currentScrollY;
            ticking = false;
        }
        
        function requestTick() {
            if (!ticking) {
                requestAnimationFrame(updateNavbar);
                ticking = true;
            }
        }
        
        window.addEventListener('scroll', requestTick);
        
        // Smooth scrolling pour les liens d'ancrage
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Animation au scroll pour les éléments
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                }
            });
        }, observerOptions);
        
        // Observer tous les éléments avec la classe fade-in
        document.querySelectorAll('.section-content, .card__content').forEach(el => {
            observer.observe(el);
        });