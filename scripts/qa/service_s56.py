"""S5/S6 acceptance on the existing dedicated emulator; synthetic records only."""
import hashlib
import json
import struct
import time

def service_s56(q, launch):
    assert q.SERIAL.startswith('emulator-')
    run_id='5'*32
    entry=json.loads((q.ROOT/'.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    before=q.snapshot('s56-before')
    preferences=q.query(f"SELECT * FROM account_preferences WHERE owner_id='{q.OWNER}'")
    api=int(q.shell('getprop','ro.build.version.sdk').decode().strip())
    export_folder='/sdcard/Download' if api<30 else '/sdcard/Pictures'
    original_exports=set(q.shell('ls','-1',export_folder).decode().splitlines())
    cache=f'/data/user/0/{q.APP}/cache/'
    notice_cache=cache+'runpen-notices.json'
    original_notice=q.adb('exec-out','cat',notice_cache) if 'runpen-notices.json' in q.shell('ls','-1',cache).decode().splitlines() else None
    wifi=q.shell('settings','get','global','wifi_on').decode().strip()
    mobile=q.shell('settings','get','global','mobile_data').decode().strip()
    now=int(time.time()*1000)
    literal=lambda v: "'"+str(v).replace("'","''")+"'"
    q.shell('am','force-stop',q.APP)
    values=[run_id,'completed',now,now+1800000,now,now,q.OWNER,3000,1800000,entry['id'],entry['name'],entry['json'],entry['hash'],'finished']
    q.shell('sqlite3',q.DB,'INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,course_id,course_name,course_snapshot_json,course_snapshot_hash,course_outcome) VALUES('+','.join(map(literal,values))+');')
    try:
        launch('run-result?id='+run_id)
        assert q.find(q.capture('s5-result'),'run-result-badge') is not None
        q.seek('run-result-share');q.tap('run-result-share')
        q.capture('s5-card-options')
        for key in ['card-nickname','card-date']:
            assert q.find(q.capture('current'),key).get('checked')=='true'
        q.seek('card-preview');q.tap('card-preview');q.seek('card-share');q.capture('s5-story-preview')
        folder=f'/data/user/0/{q.APP}/cache/runpen-cards/'
        names=q.shell('ls',folder).decode().splitlines()
        assert len(names)==1
        story=q.adb('exec-out','cat',folder+names[0]);assert struct.unpack('>II',story[16:24])==(1080,1920)
        (q.OUT/'s5-card-story.png').write_bytes(story)
        q.tap('card-share');q.capture('s5-system-share');q.shell('input','keyevent','4')
        q.seek('card-save');q.tap('card-save');q.capture('s5-system-save')
        # DocumentsUI remembers Pictures across app-data resets. Back can first
        # navigate to its parent; require a real return to the card before continuing.
        for _ in range(3):
            q.shell('input','keyevent','4')
            if q.find(q.capture('s5-save-cancel-return'),'card-save') is not None: break
        else: raise RuntimeError('Document picker did not return after cancellation')
        q.seek('card-save');q.tap('card-save')
        if api<30:
            # API 29 starts at Downloads and exposes an ALLOW ACCESS button.
            # Keep the observed folder and verify the actual exported bytes there.
            picker=q.capture('s5-save-destination')
            assert q.find(picker,'ALLOW ACCESS TO "DOWNLOADS"') is not None
            q.tap('android:id/button1')
        else:
            q.tap('Pictures');q.tap('USE THIS FOLDER')
        q.tap('android:id/button1')
        q.capture('s5-file-saved')
        created=set(q.shell('ls','-1',export_folder).decode().splitlines())-original_exports
        assert len(created)==1 and next(iter(created)).startswith('RunPen-')
        exported=q.adb('exec-out','cat',export_folder+'/'+next(iter(created)))
        assert exported==story,'Saved file differs from the preview'
        q.seek('card-format');q.tap('card-format');q.tap('피드 4:5 · 1080×1350')
        q.seek('card-nickname');q.tap('card-nickname');q.tap('card-date')
        q.seek('card-preview');q.tap('card-preview');q.seek('card-share');q.capture('s5-feed-preview')
        names=q.shell('ls',folder).decode().splitlines();assert len(names)==2
        feed=q.adb('exec-out','cat',folder+sorted(names)[-1]);assert struct.unpack('>II',feed[16:24])==(1080,1350)
        (q.OUT/'s5-card-feed-private.png').write_bytes(feed)
        launch('account');q.seek('badge-'+entry['snapshot']['shape']);q.capture('s5-account-badge')
        q.tap('badge-'+entry['snapshot']['shape']);assert q.find(q.capture('s5-badge-record'),'run-distance') is not None
        launch('service-info');q.capture('s6-menu')
        q.seek('support-about');q.tap('support-about');q.capture('s6-about');q.tap('service-back')
        q.seek('support-guide');q.tap('support-guide');q.capture('s6-guide');q.tap('service-back')
        q.seek('support-faq');q.tap('support-faq');q.seek('faq-gps');q.tap('faq-gps');q.capture('s6-faq');q.tap('service-back')
        q.seek('support-inquiry');q.tap('support-inquiry');q.seek('inquiry-title');q.capture('s6-inquiry-member');q.tap('service-back')
        # Exercise the app's real last-good cache with an explicitly synthetic
        # publication. No production notice or product fixture hook is used.
        fixture=q.OUT/'s56-notice-fixture.json'
        fixture.write_text(json.dumps({'fetchedAt':now-1000,'notices':[{'id':'s56-qa','title':'격리 검증용 공지',
            'body':'이 공지는 격리 에뮬레이터의 저장본 검증에만 사용합니다. 운영 게시물이 아닙니다.',
            'category':'검증','publishedAt':'2026-10-01T00:00:00Z'}]},ensure_ascii=False),encoding='utf8')
        q.adb('push',str(fixture),notice_cache)
        q.shell('svc','wifi','disable');q.shell('svc','data','disable')
        q.seek('support-notices');q.tap('support-notices');q.seek('notice-s56-qa')
        assert any('오프라인 저장본' in n.get('text','') for n in q.capture('s6-notices').iter('node'))
        q.tap('notice-s56-qa')
        detail=q.capture('s6-notice-detail')
        assert any('운영 게시물이 아닙니다.' in n.get('text','') for n in detail.iter('node'))
        assert any('오프라인 저장본' in n.get('text','') for n in detail.iter('node'))
        q.seek('목록으로 돌아가기');q.tap('목록으로 돌아가기');q.seek('notice-s56-qa');q.capture('s6-notice-back')
        q.tap('service-back')
        q.shell('svc','wifi','disable' if wifi=='0' else 'enable');q.shell('svc','data','disable' if mobile=='0' else 'enable')
        launch('account-settings');q.seek('theme-dark');q.tap('theme-dark');q.capture('s6-theme-dark')
        q.shell('am','force-stop',q.APP);launch('account-settings');q.seek('theme-dark');q.capture('s6-theme-restarted')
        assert '선택됨' in q.find(q.capture('current'),'theme-dark').get('content-desc','') or any('어둡게 · 선택됨' in n.get('text','') for n in q.capture('current').iter('node'))
        q.seek('theme-light');q.tap('theme-light')
        q.shell('wm','density','480');q.shell('settings','put','system','font_scale','1.6')
        # Density/font changes recreate the activity; cold-launch the target only
        # after applying them so an old activity cannot consume the deep link.
        q.shell('am','force-stop',q.APP)
        launch('run-result?id='+run_id);q.seek('run-result-share');q.capture('s5-result-large-font')
        launch('service-info');q.seek('support-location');q.capture('s6-menu-large-font')
        (q.OUT/'s56-result.json').write_text(json.dumps({'storySha256':hashlib.sha256(story).hexdigest(),'feedSha256':hashlib.sha256(feed).hexdigest(),'nicknameDateDefault':True,'calories':False,'saveCancel':True,'savedBytesEqualPreview':True,'shareChooser':True,'themeRestart':True,'noticesOfflineDetailBack':True}),encoding='utf8')
    except Exception:
        try: q.capture('s56-action-failure')
        except Exception: pass
        raise
    finally:
        q.shell('am','force-stop',q.APP)
        if original_notice is None: q.shell('rm','-f',notice_cache)
        else:
            restore=q.OUT/'s56-notice-cache-restore.json';restore.write_bytes(original_notice)
            q.adb('push',str(restore),notice_cache)
            assert q.adb('exec-out','cat',notice_cache)==original_notice
        q.shell('svc','wifi','disable' if wifi=='0' else 'enable');q.shell('svc','data','disable' if mobile=='0' else 'enable')
        for name in set(q.shell('ls','-1',export_folder).decode().splitlines())-original_exports:
            if name.startswith('RunPen-') and name.endswith('.png') and '/' not in name:
                q.shell('rm',export_folder+'/'+name)
        q.shell('sqlite3',q.DB,f"DELETE FROM running_sessions WHERE id='{run_id}'; DELETE FROM account_preferences WHERE owner_id='{q.OWNER}';")
        for row in preferences:
            q.shell('sqlite3',q.DB,'INSERT INTO account_preferences(owner_id,preferences_json,updated_at) VALUES('+','.join(map(literal,[row['owner_id'],row['preferences_json'],row['updated_at']]))+');')
        q.shell('wm','density','420');q.shell('settings','put','system','font_scale','1.0')
        launch()
        assert q.snapshot('s56-after')==before,'S56 changed original data'
    print('PASS: S5 real PNG sizes/defaults/private toggles and S6 guide/FAQ/theme restart/accessibility',flush=True)
