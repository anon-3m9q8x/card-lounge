import os
BASE_URL = os.environ.get("CARD_LOUNGE_BASE_URL", "http://127.0.0.1:3400")
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];(root/'docs/screenshots').mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE_URL);assert page.locator('.game-card').count()==5;assert page.locator('.game-card.available').count()==5
 page.screenshot(path=str(root/'docs/screenshots/home-dark.png'),full_page=True)
 page.get_by_role('button',name='神経衰弱をはじめる').focus();page.keyboard.press('Enter');page.get_by_role('button',name='この設定ではじめる').focus();page.keyboard.press('Space');assert page.locator('.playing-card').count()==16
 assert all('裏向きカード' in x for x in page.locator('.playing-card').evaluate_all('(els)=>els.map(e=>e.getAttribute("aria-label"))'))
 def saved():return page.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1")).saves.memory')
 s=saved();first=s['tiles'][0];other=next((i,t) for i,t in enumerate(s['tiles']) if t['pairKey']!=first['pairKey']);page.locator('.playing-card').nth(0).focus();page.keyboard.press('Enter');page.locator('.playing-card').nth(other[0]).focus();page.keyboard.press('Space');page.get_by_role('button',name='Ⅱ 一時停止',exact=True).click();before=saved();page.wait_for_timeout(1000);assert saved()['clock']['elapsedMs']==before['clock']['elapsedMs'];assert len(page.locator('.face-up').all())==2
 page.get_by_role('button',name='プレイを再開する').click();page.wait_for_timeout(850);assert page.locator('.face-up').count()==0
 page.get_by_role('button',name='保存・終了').click();page.get_by_role('button',name='保存して終了',exact=True).click();assert page.locator('.resume-card').is_visible();page.locator('.resume-card button').click();page.get_by_role('button',name='プレイを再開する').click()
 s=saved();keys={t['pairKey'] for t in s['tiles']}
 for key in keys:
  indexes=[i for i,t in enumerate(s['tiles']) if t['pairKey']==key]
  for i in indexes:page.locator('.playing-card').nth(i).click()
 assert page.locator('.result-panel h1').inner_text()=='クリア'
 d=page.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1"))');assert len(d['records'])==1;assert not d['saves'];assert d['records'][0]['outcome']=='completed'
 page.reload();assert page.locator('.result-panel h1').inner_text()=='クリア';assert len(page.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1")).records'))==1
 page.get_by_role('button',name='戦績を見る').click();assert page.locator('.record-list li').count()==1;assert page.locator('.ranking-list li').count()==1
 page.locator('nav').get_by_role('link',name='設定').click();page.get_by_role('button',name='バーガンディ',exact=True).click();page.get_by_role('button',name='クラシック',exact=True).click();page.reload();assert page.locator('.app').get_attribute('data-table')=='burgundy';assert page.locator('.app').get_attribute('data-back')=='classic'
 page.locator('nav').get_by_role('link',name='ホーム',exact=True).click();page.get_by_role('button',name='神経衰弱をはじめる').click();page.get_by_label('モード',exact=True).select_option('vsCpu');page.get_by_label('ペア数',exact=True).select_option('26');page.get_by_label('CPUの難易度',exact=True).select_option('hard');page.get_by_role('button',name='この設定ではじめる').click();assert page.locator('.playing-card').count()==52
 s=saved();first=s['tiles'][0];i=next(i for i,t in enumerate(s['tiles']) if t['pairKey']!=first['pairKey']);page.locator('.playing-card').nth(0).click();page.locator('.playing-card').nth(i).click();page.wait_for_timeout(1500);assert saved()['turn']=='cpu1';assert saved()['moveCount']>=3
 page.get_by_role('button',name='Ⅱ 一時停止',exact=True).click();moves=saved()['moveCount'];page.wait_for_timeout(1000);assert saved()['moveCount']==moves
 for width in [320,390,820,1440]:
  page.set_viewport_size({'width':width,'height':950})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [320,390]:assert page.locator('.playing-card').first.bounding_box()['width']>=44
  page.screenshot(path=str(root/f'docs/screenshots/memory-{width}.png'),full_page=True)
 page.get_by_role('button',name='保存・終了').click();page.get_by_role('button',name='保存せず終了',exact=True).click()
 assert page.locator('.resume-card').count()==0
 for width in [320,390,820,1440]:
  page.set_viewport_size({'width':width,'height':950})
  for theme in ['light','dark']:
   if page.locator('.app').get_attribute('data-theme')!=theme:page.locator('.theme-toggle').click()
   for name in ['ホーム','ゲームを選ぶ','戦績・ランキング','設定']:
    page.locator('nav').get_by_role('link',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme,name)
   page.locator('nav').get_by_role('link',name='ホーム',exact=True).click();page.screenshot(path=str(root/f'docs/screenshots/home-{width}-{theme}.png'),full_page=True)
 # Future data must stay untouched, even after settings updates and starting a game.
 ctx=browser.new_context();bad=ctx.new_page();bad.add_init_script("localStorage.setItem('card-lounge:v1','{\"schemaVersion\":2,\"protected\":true}')");bad.goto(BASE_URL);assert bad.locator('.warning').is_visible();bad.locator('.theme-toggle').click();bad.get_by_role('button',name='神経衰弱をはじめる').click();bad.get_by_role('button',name='この設定ではじめる').click();assert bad.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1")).schemaVersion')==2
 # A separate tab edit must pause and protect the other tab rather than overwriting it.
 page.set_viewport_size({'width':1440,'height':1000});page.get_by_role('button',name='神経衰弱をはじめる').click();page.get_by_role('button',name='この設定ではじめる').click();second=context.new_page();second.goto(BASE_URL);second.evaluate("localStorage.setItem('card-lounge:v1','{\"schemaVersion\":2,\"otherTab\":true}')");page.wait_for_timeout(300);assert page.locator('.pause-overlay').is_visible();assert '別のタブ' in page.locator('.warning').inner_text();assert second.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1")).otherTab') is True
 assert not errors,errors;browser.close()
print('PASS: playable solo completion and one-time record/ranking, CPU play, pause/resume and mismatch timer, save/quit, 52-card layout and >=44px cards on small screens, skins persisted, both themes at320/390/820/1440px, future-save protection, cross-tab conflict protection; no JS errors.')
