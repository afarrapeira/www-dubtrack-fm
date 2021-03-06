
/**
 *	Backbone views
 *
 */

Dubtrack.View.Player = Backbone.View.extend({
	el: $('#main_player .player_container'),

	voteCount: 0,

	playbackQuality: 'default',

	events : {
		"click .placeholder": "displayQueueBrowser",
		"click .skip-el": "skipSong",
		"click .playbtn-el": "playCurrentSong",
		"click .refresh-el" : "reloadVideo",
		"click .videoquality-el": "changeYTQuality"
	},

	initialize : function(){
		this.playing = false;

		this.autoplayStarted = false;

		//dubtrackMain.config.playerCountDown = dubtrackMain.config.playerMainContainer.find('#countDownDivmain');

		this.loadingEl = this.$('.loading-el').html(dubtrack_lang.player.loading);
		this.bufferingEl = this.$('.buferring-el').html(dubtrack_lang.player.buffering);
		this.playElBtn = this.$('.playbtn-el');
		this.queueInfo = $('.queue-info');
		this.qualityElBtn = this.$('.videoquality-el');
		this.refreshElBtn = this.$('.refresh-el');
		this.skipElBtn = this.$('.skip-el');
		this.errorElBtn = $('<div/>', { class : "loading" } ).html( dubtrack_lang.player.error ).css({"display" : "none"}).appendTo( dubtrackMain.config.playerContainer );
		this.placeHolder = this.$('.placeholder');
		this.customEmbedIframeDiv = this.$('#custom_iframe_embed');
		this.customEmbedIframeErrorDiv = this.$('#custom_iframe_embed_error');

		var activeQueueUrl = Dubtrack.config.urls.roomPlaylist.replace( ":id", this.model.id );
		this.actveQueueCollection = new Dubtrack.Collection.RoomActiveQueue();
		this.actveQueueCollection.url = Dubtrack.config.apiUrl + activeQueueUrl;

		Dubtrack.Events.bind('realtime:room-update', this.render, this);

		var self = this;

		this.minEl = Dubtrack.playerController.$('.min');
		this.secEl = Dubtrack.playerController.$('.sec');
		this.progressEl = Dubtrack.playerController.$('.progressBg');

		this.pictureEl = Dubtrack.playerController.$('.imgEl');

		var url = Dubtrack.config.urls.roomPlaylistActive.replace( ":id", this.model.id );

		this.activeSong = new Dubtrack.Model.ActiveQueue();
		this.activeSong.url = Dubtrack.config.apiUrl + url;

		this.activeSong.parse = Dubtrack.helpers.parse;

		Dubtrack.Events.bind('realtime:room_playlist-update', this.realTimeUpdate, this);

		//fetch new song
		this.fetchSong();
	},

	skipSong: function(){
		this.skipElBtn.hide();
		Dubtrack.room.chat.skipSong();

		return false;
	},

	render : function(){
		var songInfo = this.activeSong.get('songInfo'),
			song = this.activeSong.get('song'),
			type = "";

		this.skipElBtn.hide();
		this.qualityElBtn.removeClass('show');
		this.refreshElBtn.removeClass('show');

		if(this.refreshTimeout) clearTimeout(this.refreshTimeout);
		if(this.queue_timeout) clearTimeout(this.queue_timeout);

		this.customEmbedIframeDiv.empty();
		this.$('.playerElement').remove();

		if(Dubtrack.room.model.get('roomType') == 'iframe'){
			this.placeHolder.hide();
			Dubtrack.playerController.$('.currentTime').hide();
			if(this.playerDelegate) this.playerDelegate.close();
			$('.remove-if-iframe').removeClass('display-block');
			Dubtrack.playerController.$('.currentSong').html('');
			$('.custom-embed-info').show();
			this.pictureEl.hide();
			this.loadingEl.hide();
			$('.infoContainer').removeClass('display-block');
			this.$('#room-main-player-container').empty();
			this.$('#room-main-player-container').hide();

			var roomEmbedUrl = Dubtrack.room.model.get('roomEmbed'),
				regexp = /(http:\/\/|https:\/\/|\/\/)(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;

			if(roomEmbedUrl && regexp.test(roomEmbedUrl)){
				this.customEmbedIframeErrorDiv.hide();
				roomEmbedUrl = roomEmbedUrl.replace('http:', 'https:');
				this.customEmbedIframeDiv.show().html('<div id="custom_iframe_overlay"></div><iframe src="' + roomEmbedUrl + '" width="100%" height="100%" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>');
			}else{
				this.customEmbedIframeErrorDiv.show();
			}

			return;
		}else{
			$('.custom-embed-info').hide();
			$('.remove-if-iframe').addClass('display-block');
			$('.infoContainer').addClass('display-block');
			this.customEmbedIframeDiv.hide();
			this.customEmbedIframeErrorDiv.hide();

			this.$('#room-main-player-container').empty();
			this.$('#room-main-player-container').show();
		}

		if(songInfo !== null){
			Dubtrack.playerController.$('.currentSong').html( songInfo.name );
			Dubtrack.cache.users.get(song.userid, this.renderUser, this);

			type = songInfo.type;
		}

		switch(type){
			case "youtube":
				this.placeHolder.hide();
				this.buildYT();
				this.playCurrent();
			break;
			case "soundcloud":
			case "dubtrack":
				this.placeHolder.hide();
				this.buildSoundCloud();
				this.playCurrent();
			break;
			default:
				this.loadingEl.hide();
				Dubtrack.playerController.$('.currentSong').html( dubtrack_lang.player.no_one_is_playing );
				this.placeHolder.show();
				this.pictureEl.hide();
			break;
		}

		//load comments
		//this.loadComments();
		//update player controler
		Dubtrack.playerController.update();

		//this.usernameEL.html( dubtrackMain.helpers.getProfileImg(this.model.get('oauth_uid'), this.model.get('username'), this.model.get('oauth_provider')) );
		this.fetchQueueInfo();

		return this;
	},

	displayQueueBrowser: function(){
		Dubtrack.app.navigate("/browser/queue", {
			trigger: true
		});

		return false;
	},

	playCurrent: function(){
		var songInfo = this.activeSong.get('songInfo'),
			song = this.activeSong.get('song'),
			startTime = this.activeSong.get('startTime'),
			sontLength = song.songLength/1000;

		if(startTime > sontLength) return this.videoEnd();

		if(Dubtrack.session && Dubtrack.room && Dubtrack.room.users && (Dubtrack.helpers.isDubtrackAdmin(Dubtrack.session.id) || Dubtrack.room.model.get('userid') == Dubtrack.session.id || Dubtrack.room.users.getIfMod(Dubtrack.session.id) )){
			this.skipElBtn.show();
		}

		//this.playElBtn.hide();
		this.playerDelegate.play();

		this.setTimer( startTime, sontLength );
	},

	playCurrentSong: function(){
		this.playElBtn.hide();
		console.log('play current song');
		this.playerDelegate.play();

		return false;
	},

	loadComments: function(){
		return;

		var songInfo = this.activeSong.get('songInfo');

		if(this.playerComments) this.playerComments.close();

		if(songInfo !== null){
			var url = Dubtrack.config.apiUrl + Dubtrack.config.urls.songComments.replace( ":id", songInfo._id );

			this.playerComments = new Dubtrack.View.comment();
			this.playerComments.render(url).$el.appendTo($('section#room-comments'));
		}
	},

	renderUser: function(err, user){
		if(err) return;

		this.activeSong.set('user', user);

		var userInfo = user.get('userInfo');

		if(Dubtrack.room && Dubtrack.room.users) Dubtrack.room.users.setCurrentDJ(user.get("_id"));

		//display user image
		this.pictureEl.html( Dubtrack.helpers.image.getImage(user.get("_id"), user.get("username"), false, true ) ).show();
	},

	realTimeUpdate: function(r){
		var song = this.activeSong.get('song');

		if(song === null || song._id != r.song._id){
			console.log("DUBTRACK UPDATING PLAYER!");
			this.refresh();

			this.activeSong.set({
				song: r.song,
				songInfo: r.songInfo,
				startTime: r.startTime,
				user: null
			});

			this.render();
		}
	},

	refresh : function(){
		this.playing = false;

		//reset variables
		$('li.downdub').removeClass('downdub');
		$('li.updub').removeClass('updub');
		$(".shared").removeClass('shared');

		this.loadingEl.show();
		this.bufferingEl.hide();
		this.progressEl.css( 'width',  0 );
		Dubtrack.playerController.$('.currentTime').hide();

		Dubtrack.playerController.$('.currentSong').html( dubtrack_lang.global.loading );
		this.pictureEl.empty();

		if(this.playerDelegate) this.playerDelegate.close();
		this.$('#room-main-player-container').empty();

		if(Dubtrack.room && Dubtrack.room.users) Dubtrack.room.users.removeCurrentDJ();
		if(Dubtrack.room && Dubtrack.room.users) Dubtrack.room.users.removeDubs();

		if(this.intervalCounter) clearInterval(this.intervalCounter);
	},

	fetchQueueInfo : function(){
		if(this.queue_timeout) clearTimeout(this.queue_timeout);

		//empty html
		this.queueInfo.empty().removeClass('queue-active');

		//get room active queu
		this.actveQueueCollection.fetch({
			reset: true,

			success : function(){
				var queueCounter = 0;
				_.each(this.actveQueueCollection.models, function(activeQueueItem){
					queueCounter++;

					if(Dubtrack.session.id == activeQueueItem.get('userid')){
						this.queueInfo.html(queueCounter).addClass('queue-active');
					}
				}, this);

				this.queue_timeout = setTimeout(function(){
					this.fetchQueueInfo();
				}.bind(this), 30000);
			}.bind(this)
		});
	},

	changeYTQuality: function(){
		if(!this.playerDelegate) return false;

		var index = 0,
			levels = this.playerDelegate.getAvailableQualityLevels();

		if(levels.length < 1) return;

		switch(this.playbackQuality){
			case "default":
				this.qualityElBtn.html("HD ON");
				this.playbackQuality = "highres";
				index = 0;
			break;
			case "medium":
				this.qualityElBtn.html("AUTO");
				this.playbackQuality = "default";
				index = levels.length - 1;
			break;
			case "highres":
				this.qualityElBtn.html("HD OFF");
				this.playbackQuality = "medium";
				index = levels.length - 2;
			break;
			default:
				this.qualityElBtn.html("AUTO");
				this.playbackQuality = "default";
				index = levels.length - 1;
		}

		if(index >= 0) this.playerDelegate.setPlaybackQuality(levels[index]);

		return false;
	},

	reloadVideo: function(){
		this.refresh();

		this.fetchSong();

		return false;
	},

	videoEnd: function(){
		this.refresh();
		this.skipElBtn.hide();

		this.playing = false;
		if(this.refreshTimeout) clearTimeout(this.refreshTimeout);

		var self = this;
		this.refreshTimeout = setTimeout(function(){
			self.render();
		}, 15000);
	},

	fetchSong : function(){
		var self = this;

		this.refresh();

		this.activeSong.fetch({
			success: function(model, r){
				self.render();
			},

			error: function(){
				self.activeSong.set({
					song: null,
					songInfo: null,
					user: null,
					startTime: null
				});

				self.render();
			}
		});
	},

	loadQueueNumber : function(){},

	getStarTime: function(){
		var startTime = this.activeSong.get('startTime'),
			song = this.activeSong.get('song');

		if(startTime == -1){
			startTime = 0;
		}else{
			startTime = parseInt((Date.now() - song.played)/1000, 10);

			if(startTime < 0) startTime = 0;
		}

		this.activeSong.set({
			'startTime': startTime
		});

		return startTime;
	},

	buildYT : function(){
		if(this.playerDelegate) this.playerDelegate.close();
		this.$('#room-main-player-container').empty();

		var song = this.activeSong.get('song'),
			songInfo = this.activeSong.get('songInfo'),
			startTime = this.getStarTime();

		this.playerDelegate = new Dubtrack.View.YoutubePlayer();
		this.playerDelegate.$el.appendTo( this.$('#room-main-player-container') );
		var self = this;

		this.playElBtn.hide();
		this.qualityElBtn.addClass('show');
		this.refreshElBtn.addClass('show');

		if(song.songLength/1000 == 99999) startTime = -1;

		this.playerDelegate.render(songInfo.fkid, startTime, function(){
			self.videoEnd();
		}, this, true );
	},

	buildSoundCloud : function(){
		if(this.playerDelegate) this.playerDelegate.close();
		this.$('#room-main-player-container').empty();
		this.refreshElBtn.addClass('show');

		var song = this.activeSong.get('song'),
			songInfo = this.activeSong.get('songInfo'),
			startTime = this.getStarTime();

		var self = this,
			width = this.$el.innerWidth(),
			height = this.$el.innerHeight();

		if(is_mobile()){
			this.loadingEl.hide();
			this.playElBtn.show();
		}

		this.playerDelegate = new Dubtrack.View.SoundCloudPlayer();
		this.playerDelegate.$el.appendTo( this.$('#room-main-player-container') );

		this.playerDelegate.render(songInfo.streamUrl, startTime, function(){
			self.videoEnd();
		}, this, width, height, true );
	},

	setTimer : function(start, length){
		Dubtrack.playerController.$('.currentTime').show();

		this.videoLength = length;

		if(this.intervalCounter) clearInterval(this.intervalCounter);

		if(length == 99999){
			this.playingLive = true;
			this.minEl.html('');
			this.secEl.html("LIVE");
			return;
		}else{
			this.playingLive = false;
		}

		var countDown = length - start,
			minutesDown = Math.floor(countDown / 60),
			secondsDown = parseInt( countDown - minutesDown * 60, 10);

		if(countDown <= 0) return;

		this.minEl.html("0".substring(minutesDown >= 10) + minutesDown);
		this.secEl.html("0".substring(secondsDown >= 10) + secondsDown);

		var self = this;
		this.intervalCounter = setInterval(function(){
			self.setTimerCounter();
		}, 1000);
	},

	setTimerCounter : function(){
		var song = this.activeSong.get('song'),
			currentTime = parseInt((Date.now() - song.played)/1000, 10),
			countDown = this.videoLength - currentTime,
			minutesDown = Math.floor(countDown / 60),
			secondsDown = parseInt( countDown - minutesDown * 60, 10),
			songInfo = this.activeSong.get('songInfo');

		if(countDown <= 0) return;

		this.minEl.html("0".substring(minutesDown >= 10) + minutesDown);
		this.secEl.html("0".substring(secondsDown >= 10) + secondsDown);

		var w = currentTime * 100 / (songInfo.songLength/1000);
		this.progressEl.css('width',  w + '%');
	},

	setVolume : function(vol){
		this.player_volume_level = vol;
		Dubtrack.playerController.volume = vol;

		if(!this.playerDelegate) return;

		//if(vol <= 2) this.player_instance.setMute(true);
		//else this.player_instance.setMute(false);

		this.playerDelegate.setVolume(vol);
	},

	setVolumeRemote : function(vol){
		if(!this.playerDelegate) return;

		//if(vol <= 2) this.player_instance.setMute(true);
		//else this.player_instance.setMute(false);

		this.playerDelegate.setVolume(vol);
	},

	sync : function(sec){
		if(this.playerDelegate && this.playing) this.playerDelegate.sync(sec);
	},

	getCurrentTime : function(){
		if(this.playerDelegate) return this.playerDelegate.getCurrentTime();
	},

	beforeClose : function(){
		if(this.playerDelegate) this.playerDelegate.close();

		if(this.intervalCounter) clearInterval(this.intervalCounter);

		if(this.playerControls) this.playerControls.close();

		dubtrackMain.config.playerMainContainer.html( $('<div/>', {'class' : 'player_container'} ) );
		dubtrackMain.config.playerContainer = dubtrackMain.config.playerMainContainer.find('div.player_container');
	}
});
