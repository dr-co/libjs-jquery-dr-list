/*
 * jQuery DR-List plugin
 * Plugin for jQuery to make AJAX table simple
 *
 * Copyright (C) 2011 Dmitry E. Oboukhov <unera@debian.org>
 * Copyright (C) 2011 Roman V. Nikolaev <rshadow@rambler.ru>
 *
 * Version: 0.5
 *
 * This program is free software, you can redistribute it and/or
 * modify it under the terms of the Artistic License.
*/

(function( $ ) {

    var defaults = {
        // Таблицы берется при привязкие плагина
        table:          null,
        // Элементы которые есть на странице
        filters:        '> thead > tr > th > form.filters:first',
        route:          '> thead > tr > th > form.filters input.route:first',
        loader:         '> thead > tr > th > form.filters img.loader:first',
        pager:          '> thead > tr > th > form.filters nav.pager:first',
        page:           '> thead > tr > th > form.filters input[name="page"]',
        clear:          '> thead > tr > th > form.filters button.clear',
        reload:         '> thead > tr > th > form.filters button.reload',
        // Элементы которые будут получены через AJAX запрос:
        // Селекторы данных. По данным селекторам элементы из таблицы будут
        // заменены элементами из AJAX запроса.
        // Можно использовать скаляр или массив.
        body:           ['> tbody', '> tfoot'],
        // Селектор пейджера. Аналогично данным.
        pages:          'div.list_pager',

        // Другие параметры:

        // Таймаут для автоматического обновления списка
        timeout:        null,
        // Таймаут для автоматического обновления списка при ошибках
        errtimeout:     40000,
        // Дельта расброса для errtimeout. Сделана для снижения нагрузки
        // при массовых отвалах
        errdelta:       10000,

        // Что делать при получении данных. Возможно: replace, append
        method:         'replace',
    };

    var tables = new Array();

    $.fn.drList = function( set ) {
        // Помержим опции с параметрами по умолчанию
        var opts = {};
        opts = $.extend(opts, defaults);
        opts = $.extend(opts, set);
        opts.table = this;
        // Сохраним в списке
        var index = tables.push( opts ) - 1;
        // После загрузки документа, загрузим список
        $(document).ready(function(){ LoadList(index) });

        // Добавим наш класс
        $(opts.table).addClass('dr-list');

        // Возвратим сабы чтобы можно было подергать извне
        return {
            update:     function()          { UpdateList(index) },
            filters:    function( method )  { UpdateFilters(index, method) }
        };
    };

    function LoadList( index ) {
        var opts = tables[index];

        // Не работаем с фильтрами если не задан адрес для запросов.
        if(! $(opts.table).find(opts.route) )          { return; }
        if(! $(opts.table).find(opts.route).val() )    { return; }

        // Получим (или нет) все объекты
        opts.route   = $(opts.table).find(opts.route).val();
        opts.filters = $(opts.table).find(opts.filters);
        opts.inputs  = $(opts.filters).find(':input');
        opts.loader  = $(opts.table).find(opts.loader);
        opts.pager   = $(opts.table).find(opts.pager);
        opts.page    = $(opts.table).find(opts.page);
        opts.clear   = $(opts.table).find(opts.clear);
        opts.reload  = $(opts.table).find(opts.reload);

        // Объект текущего AJAX запроса храниться тут
        opts.ajax    = null;
        // Таймеры: переодический и ошибки
        opts.timer   = null;
        opts.etimer  = null;

        // Селекторы преобразуем к массиву
        opts.body = $.isArray( opts.body ) ?opts.body :[opts.body];

        // Сохраним переданные дефолтные значения
        UpdateFilters(index, 'default');
        // Восстановим значения фильтров
        UpdateFilters(index, 'get');

        // Повесим обработчик на фильтры
        opts.inputs.change(function( obj ){
            // Если что-то поменялось то переходим к первой странице
            opts.page.val(1);
            // Обновим список
            UpdateList( index )
        });
        // Повесим обработчик на очистку
        opts.clear.click(function(){
            // Очистим фильтры
            UpdateFilters( index, 'clear' );
            // Восстановим переданные дефолтные значения
            UpdateFilters(index, 'default');
            // Обновим список
            UpdateList( index );
        });
        // Остановка запроса
        opts.loader.click(function(){
            if( opts.ajax === null ){ return; }
            opts.ajax.abort();
            opts.ajax = null;
        });
        // Обновление списка по просьбе пользователя
        opts.reload.click(function(){
            // Отменим таймер обновления при ошибке
            if( opts.etimer != null ) {
                clearInterval( opts.etimer );
                opts.etimer = null;

                // Сбросим признак ошибки предыдущего запроса
                $(opts.loader).removeClass('error');
            }

            // Обновим список
            UpdateList( index );
        });

        // Первоначальное обновление списка
        UpdateList( index );

        // Если установлено время обновления то запустим таймер
        if( opts.timeout ) {
            opts.timer = window.setInterval(function(){
                UpdateList( index );
            }, opts.timeout);
        }
    }

    // Обновление списка
    function UpdateList( index ) {
        var opts = tables[index];

        // Не делаем повторного запроса если обновление уже идет
        if( $(opts.loader).css('display') != 'none' ) { return; }
        // Не обновляем если была ошибка. Обновлением занимается код обработки
        // ошибок.
        if( $(opts.loader).hasClass('error') ) { return; }

        // Отменим предыдущий запрос
        if( opts.ajax ){
            opts.ajax.abort();
            opts.ajax = null;
        }

        // Сохраним значение фильтров
        UpdateFilters(index, 'set');

        // Получим сериализованные данные формы
        // (надо делать до отключения элементов)
        var strFormData = $(opts.filters).serialize();

        // Покажем лоадер
        $(opts.loader).show();

        // Отключим возможность фильтровать на время обновления
        $(opts.inputs).attr('disabled', true);

        // Делаем запрос за списком
        opts.ajax = $.ajax({
            type:   "POST",
            url:    opts.route,
            data:   strFormData,
            complete: function( jqXHR, textStatus ){
                opts.ajax = null;

                switch(textStatus) {
                    case 'success':
                    case 'notmodified':
                        var tmpTable = $('<table>').html(jqXHR.responseText);
                        // Установим новые данные в таблицу
                        $.each( opts.body, function(i, selector){
                            switch (opts.method) {
                            case 'replace':
                                // Удалим данные таблицы
                                $(opts.table).find( selector ).remove();
                                break;
                            case 'append':
                                $(opts.table).find(
                                    selector + '.pending'   + ' , ' +
                                    selector + '.error'     + ' , ' +
                                    selector + '.empty'
                                ).remove();
                            default:
                                break;
                            }
                            $(opts.table).append($(tmpTable)
                                .find(selector).remove());
                        });
                        // Обновим данные пейджера
                        $(opts.pager).html( $(tmpTable)
                            .find(opts.pages).remove() );
                        // Выкинем мусор, оставшийся от передачи пейджера
                        tmpTable = null;

                        // Повесим обработчики на пейджер
                        $(opts.pager).find(':button').click(function(){
                            $(opts.page).val( $(this).val() );
                            UpdateList(index);
                        });

                        // Включим фильтры
                        $(opts.inputs).attr('disabled', false);
                        // Скроем лоадер
                        $(opts.loader).hide();

                        // Вызовем постобработчик
                        if (opts.ready && typeof(opts.ready) == 'function') {
                            opts.ready();
                        }
                        break;
                    case 'abort':
                        // Сбросим класс-флаг ошибки если он был
                        $(opts.loader).removeClass('error');
                        // Включим фильтры
                        $(opts.inputs).attr('disabled', false);
                        // Скроем лоадер
                        $(opts.loader).hide();
                        break;
                    default:
                        // Добавим класс-флаг ошибки
                        $(opts.loader).addClass('error');

                        // Получим colspan
                        var colspan = _column_count( $(opts.table) ) || 1;
                        // Получим таймаут
                        var timeout = Math.ceil(
                            (opts.errtimeout - Math.random() * opts.errdelta) /
                                1000 );

                        // Куда выводим оставшееся время
                        var objTimeout = $('<span/>').text(timeout);
                        // Ячейка с выводом ошибки
                        var objTd = $('<td/>')
                            .addClass('error')
                            .attr('colspan', colspan)
                            .append('Ошибка получения списка. ')
                            .append('Повторный запрос через ')
                            .append( objTimeout )
                            .append(' сек.');
                        var objTr = $('<tr/>').append( objTd );
                        var objTbody = $('<tbody class="error"/>')
                            .append( objTr );

                        // Заменим tbody на сообщение об ошибке
                        $.each( opts.body, function(i, selector){
                            switch (opts.method) {
                            case 'replace':
                                // Удалим данные таблицы
                                $(opts.table).find( selector ).remove();
                                break;
                            case 'append':
                                $(opts.table).find(
                                    selector + '.pending'   + ' , ' +
                                    selector + '.error'     + ' , ' +
                                    selector + '.empty'
                                ).remove();
                            default:
                                break;
                            }
                        });
                        $(opts.table).append( objTbody );

                        // Запустим таймер с отсчетом
                        opts.etimer = window.setInterval(function(){
                            timeout--;
                            objTimeout.text(timeout);
                            if(timeout <= 0) {
                                // Очистим таймер
                                clearInterval( opts.etimer );
                                opts.etimer = null;
                                // Сбросим класс-флаг ошибки
                                $(opts.loader).removeClass('error');
                                // Обновим список
                                UpdateList(index);
                                // Выводим сообщение
                                objTd.text('Подождите, список сейчас будет получен.');
                            }
                        }, 1000);

                        // Включим фильтры
                        $(opts.inputs).attr('disabled', false);
                        // Скроем лоадер
                        $(opts.loader).hide();
                        break;
                }
            }
        });
    }

    // Обновление фильтров
    // strMethod    - что мы хотим сделать:
    //      get     - из хранилища обновить значения всем элементам
    //      set     - из значений элементов записать в хранилище
    //      default - из значений элементов записать в хранилище, но не удалять
    //                если значение в элементе не задано
    function UpdateFilters( index, strMethod ) {
        var opts = tables[index];

        // Проверим метод
        if( !
            ( strMethod == 'get'    ||
              strMethod == 'set'    ||
              strMethod == 'default'||
              strMethod == 'clear'
            )
        ) {
            throw 'strMethod can be: get, set, default, clear';
        }

        $.each($(opts.inputs), function(iIndex, objFilter) {
            // Пропустим вспомогательные элементы без имен
            if( $(objFilter).attr('name') == null ) { return; }

            // Определим строку ключа к хранилищу
            var strKey = 'filter:'+ opts.route +':'+ $(objFilter).attr('name');

            var strType = $(objFilter).attr('type');
            strType = (strType == null) ?$(objFilter).prop('type') :strType;

            // Разные методы восстановления значения для разных видов элементов
            switch ( strType ) {
            case "checkbox":
            case "radio":
                // Так как часто используются одни и теже имена со статически
                // значениями, то различать будем так же по значениям
                strKey = strKey + ':' + $(objFilter).val();
                // Определим значение
                var strValue = new String( $(objFilter).val() );

                switch ( strMethod ) {
                case 'get':
                    // Пропустим не тот элемент
                    if ( strValue.toString() != $.jStorage.get(strKey, null) ) {
                        return;
                    }

                    $(objFilter).attr( 'checked', 'checked' );
                    $(objFilter).prop( 'checked', true );
                    break;
                case 'clear':
                    if( $(objFilter).data('dr-list-init') ) {
                        $(objFilter).attr( 'checked', 'checked' );
                        $(objFilter).prop( 'checked', true );
                    } else {
                        $(objFilter).removeAttr( 'checked' );
                        $(objFilter).prop( 'checked', false );
                    }
                case 'set':
                    // Удалим или пропустим не выбранныей элемент
                    if ( ! $(objFilter).attr('checked') ) {
                        $.jStorage.deleteKey(strKey);
                        return;
                    }

                    if( strValue.length ) {
                        $.jStorage.set(strKey, strValue.toString() );
                    } else {
                        $.jStorage.deleteKey(strKey);
                    }
                    break;
                case 'default':
                    $(objFilter).data('dr-list-init', $(objFilter).prop('checked'));
                default:
                    // Пропустим не выбранныей элемент
                    if ( ! $(objFilter).attr('checked') ) { return; }
                    // Устаноим новое значение
                    if( strValue.length ) {
                        $.jStorage.set(strKey, strValue.toString() );
                    }
                    break;
                }
                break;
            case "select":
            case "select-one":
                switch ( strMethod ) {
                case 'get':
                    $(objFilter).find("option[value='"+$.jStorage.get(strKey, '')+"']")
                        .attr('selected','selected');
                    break;
                case 'clear':
                    $(objFilter).val( $(objFilter).find("option:first").val() );
                case 'set':
                    // Определим значение
                    var strValue = new String( $(objFilter).val() );
                    if( strValue.length ) {
                        $.jStorage.set(strKey, strValue.toString() );
                    } else {
                        $.jStorage.deleteKey(strKey);
                    }
                    break;
                case 'default':
                    $(objFilter).data('dr-list-init', $(objFilter).val());
                default:
                    // Значение по умолчанию в select устанавливаетс с помощью
                    // selected="selected"
                    break;
                }
                break;
            default:
                switch ( strMethod ) {
                case 'get':
                    $(objFilter).val( $.jStorage.get(strKey, '') );
                    break;
                case 'clear':
                    $(objFilter).val( $(objFilter).data('dr-list-init') );
                case 'set':
                    // Определим значение
                    var strValue = new String( $(objFilter).val() );

                    if( strValue.length ) {
                        $.jStorage.set(strKey, strValue.toString() );
                    } else {
                        $.jStorage.deleteKey(strKey);
                    }
                    break;
                case 'default':
                    $(objFilter).data('dr-list-init', $(objFilter).val());
                default:
                    // Определим дефолтное значение
                    var strValue = new String( $(objFilter).val() );
                    // Сохраним фильтр если был задан
                    if( strValue.length ) {
                        $.jStorage.set(strKey, strValue.toString() );
                    }
                    break;
                }
                break;
            }
        });
    }

    // Находит количество колонок для входящего объекта (table, thead, ...)
    function _column_count( obj ) {
        var count = 0;
        $(obj).find('tr:nth-child(1) td').each(function () {
            if ($(this).attr('colspan')) {
                count += +$(this).attr('colspan');
            } else {
                count++;
            }
        });
        return count;
    };

})( jQuery );
