<template>
  <footer class="footer">
    <div class="footer__inner page-container">
      <div class="footer__brand">
        <div class="footer__name">Lumen</div>
        <p class="footer__slogan">A curated archive of cinematic imagery.</p>
      </div>

      <div class="footer__cols">
        <div class="footer__col">
          <div class="footer__title">Browse</div>
          <router-link to="/" class="footer__link">Discover</router-link>
          <router-link to="/search?order=popular" class="footer__link">Popular</router-link>
        </div>
        <div class="footer__col">
          <div class="footer__title">Create</div>
          <router-link to="/upload" class="footer__link">Upload a frame</router-link>
          <router-link to="/me/uploads" class="footer__link">My uploads</router-link>
        </div>
        <div class="footer__col">
          <div class="footer__title">Account</div>
          <router-link to="/me/favorites" class="footer__link">Saved</router-link>
          <router-link to="/me/settings" class="footer__link">Settings</router-link>
        </div>
      </div>
    </div>

    <div class="footer__bottom">
      <div class="page-container footer__bottom-inner">
        <span>© {{ year }} Lumen · All images belong to their creators</span>
        <span>By uploading you agree to our content guidelines</span>
      </div>
    </div>
  </footer>
</template>

<script setup>
const year = new Date().getFullYear()
</script>

<style lang="scss" scoped>
.footer {
  margin-top: 64px;
  // Apple 式页脚：浅灰底 + 发丝分隔，和白色内容区形成稳定收口
  background: $color-bg-hover;
  border-top: 1px solid $color-border;
}

.footer__inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;
  padding-block: 32px;

  @include respond($bp-md) {
    flex-direction: column;
    gap: 24px;
  }
}

.footer__name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: $color-text;
}

.footer__slogan {
  margin-top: 6px;
  font-size: 12px;
  color: $color-text-muted;
  max-width: 260px;
}

.footer__cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px 40px;
  min-width: min(520px, 100%);

  @include respond($bp-md) {
    min-width: 0;
    width: 100%;
  }
}

.footer__col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer__title {
  font-size: 12px;
  font-weight: 600;
  color: $color-text;
  margin-bottom: 2px;
}

.footer__link {
  font-size: 12px;
  color: $color-text-secondary;

  &:hover {
    color: $color-text;
  }
}

.footer__bottom {
  border-top: 1px solid $color-border;
}

.footer__bottom-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-block: 12px;
  font-size: 12px;
  color: $color-text-muted;

  @include respond($bp-sm) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>