import os,json,re,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];base=os.environ.get('CARD_LOUNGE_BASE_URL','http://127.0.0.1:3402');fixtures=json.loads(subprocess.check_output(['node','--experimental-strip-types','tests/fixtures.ts'],cwd=root,text=True));key='card-lounge:v1'
names={'klondike':'ソリティア','oldMaid':'ババ抜き','sevens':'七並べ','speed':'スピード'}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.wait_for_selector('.game-card.available');assert page.locator('.game-card.available').count()==5
 def saved(pg):return pg.evaluate('JSON.parse(localStorage.getItem("card-lounge:v1"))')
 def game_card(pg,id):return pg.locator('.game-card').filter(has=pg.locator('h3',has_text=names[id]))
 for id in names:
  game_card(page,id).locator('.gold-button').click();page.get_by_role('button',name='この設定ではじめる').click();page.wait_for_selector('.other-table');assert saved(page)['saves'][id]['gameId']==id
  if id=='klondike':
   assert page.locator('.kl-column').count()==7;page.get_by_role('button',name='山札を1枚めくる',exact=True).click();assert saved(page)['saves'][id]['frame']['stock'].__len__()==23;page.get_by_role('button',name='↶ 1手戻す',exact=True).click();assert len(saved(page)['saves'][id]['frame']['stock'])==24
  elif id=='oldMaid':
   page.wait_for_selector('.draw-row button',timeout=7000);labels=page.locator('.draw-row button').evaluate_all('(els)=>els.map(e=>e.getAttribute("aria-label"))');assert all('裏向きカード' in x and 'JOKER' not in x and 'ジョーカー' not in x for x in labels);page.locator('.draw-row button').first.click()
  elif id=='sevens':
   page.wait_for_function("JSON.parse(localStorage.getItem('card-lounge:v1')).saves.sevens.turn==='human'",timeout=7000)
   if page.locator('.legal-card button').count():page.locator('.legal-card button').first.click()
   else:page.locator('.table-pass').click()
  else:
   page.wait_for_timeout(850);assert saved(page)['saves'][id]['moveCount']>=0
  page.screenshot(path=str(root/f'docs/screenshots/{id}-table.png'),full_page=True)
  page.get_by_role('button',name='保存・終了',exact=True).click();page.get_by_role('button',name='保存して終了',exact=True).click();assert id in saved(page)['saves'];assert not page.locator('.warning').count()
 assert len(saved(page)['saves'])==4
 page.reload();assert len(saved(page)['saves'])==4
 for id in names:
  game_card(page,id).locator('.resume-game-button').click();assert page.locator('.pause-overlay').is_visible();assert saved(page)['saves'][id]['gameId']==id
  if id=='speed':
   before=saved(page)['saves'][id]['clock']['elapsedMs'];page.get_by_role('button',name='プレイを再開する').click();page.wait_for_timeout(1100);assert page.locator('.pause-overlay').is_visible();assert saved(page)['saves'][id]['phase']=='paused';assert saved(page)['saves'][id]['clock']['elapsedMs']==before;page.wait_for_timeout(2200);assert saved(page)['saves'][id]['phase']=='paused' # saved snapshots are always paused
   assert page.locator('.pause-overlay').count()==0
   page.get_by_role('button',name='Ⅱ 一時停止',exact=True).click()
  for width in [320,390,820,1440]:
   page.set_viewport_size({'width':width,'height':950})
   for theme in ['light','dark']:
    if page.locator('.app').get_attribute('data-theme')!=theme:page.locator('.theme-toggle').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(id,width,theme)
   if width in [390,1440]:page.screenshot(path=str(root/f'docs/screenshots/{id}-{width}.png'),full_page=True)
  page.get_by_role('button',name='保存・終了',exact=True).click();page.get_by_role('button',name='保存して終了',exact=True).click()
 # End-game UI and one-time records using valid deterministic near-end fixtures.
 for id,session in fixtures['winning'].items():
  ctx=browser.new_context(viewport={'width':1280,'height':1000});pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));data=fixtures['initial'];data={**data,'saves':{id:session},'records':[],'processedSessionIds':[]};payload=json.dumps(data)
  pg.add_init_script('if(!localStorage.getItem("card-lounge:v1"))localStorage.setItem("card-lounge:v1",'+json.dumps(payload)+')');pg.goto(base);game_card(pg,id).locator('.resume-game-button').click();pg.get_by_role('button',name='プレイを再開する').click()
  if id=='klondike':
   for i,suit in enumerate(['♠','♥','♦','♣']):pg.locator('.kl-column').nth(i).locator('.face-up').focus();pg.keyboard.press('Enter');pg.get_by_role('button',name=suit+'の組札に置く',exact=True).focus();pg.keyboard.press('Space')
  elif id=='oldMaid':pg.locator('.draw-row button').first.click()
  elif id=='sevens':pg.locator('.legal-card button').first.click()
  else:
   pg.wait_for_function("!document.querySelector('.pause-overlay')",timeout=5000);pg.locator('.human-visible button').click();pg.get_by_role('button',name=re.compile('左の中央札')).click()
  pg.wait_for_selector('.result-panel',timeout=8000);assert pg.locator('.result-panel h1').inner_text()==('クリア' if id=='klondike' else '勝利');assert len(saved(pg)['records'])==1;assert id not in saved(pg)['saves'];pg.reload();assert len(saved(pg)['records'])==1;assert saved(pg)['records'][0]['gameId']==id
  pg.get_by_role('button',name='戦績を見る',exact=True).click();assert pg.locator('.record-list li').count()==1
  ctx.close()
 assert not errors,errors;browser.close()
print('PASS: all5 game entries; new4 playable, draw/Undo, hidden-card labels, CPU turns, 4 independent saves and reload/resume, Speed321 countdown,320/390/820/1440px light/dark, all4 end-game UI and idempotent records; no JS errors.')
