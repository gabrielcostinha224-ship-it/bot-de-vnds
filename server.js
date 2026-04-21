const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

// ... (mantenha a config do express e client do código anterior)

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('criar-painel')
            .setDescription('Configura um painel de vendas personalizado')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        // 1. ABRE O FORMULÁRIO DE CONFIGURAÇÃO
        if (i.isChatInputCommand() && i.commandName === 'criar-painel') {
            const modal = new ModalBuilder().setCustomId('modal_painel').setTitle('Configurar Painel Sirius');

            const titulo = new TextInputBuilder().setCustomId('t_painel').setLabel('Título do Produto').setStyle(TextInputStyle.Short);
            const desc = new TextInputBuilder().setCustomId('d_painel').setLabel('Descrição/Siglas').setStyle(TextInputStyle.Paragraph);
            const img = new TextInputBuilder().setCustomId('i_painel').setLabel('URL da Imagem (Banner)').setStyle(TextInputStyle.Short);
            const valor = new TextInputBuilder().setCustomId('v_painel').setLabel('Valor (Ex: 9.99)').setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titulo),
                new ActionRowBuilder().addComponents(desc),
                new ActionRowBuilder().addComponents(img),
                new ActionRowBuilder().addComponents(valor)
            );
            return await i.showModal(modal);
        }

        // 2. RECEBE OS DADOS DO MODAL E GERA O PAINEL BONITO
        if (i.isModalSubmit() && i.customId === 'modal_painel') {
            const t = i.fields.getTextInputValue('t_painel');
            const d = i.fields.getTextInputValue('d_painel');
            const img = i.fields.getTextInputValue('i_painel');
            const v = i.fields.getTextInputValue('v_painel');

            const embed = new EmbedBuilder()
                .setTitle(t)
                .setDescription(d)
                .setImage(img) // Aqui entra a URL da imagem que você quer
                .setColor("#00ff6a")
                .addFields({ name: 'Preço', value: `R$ ${v}`, inline: true })
                .setFooter({ text: "Sirius Arquiteto - Entrega Rápida" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`comprar_${t}_${v}`).setLabel('Ver Opções').setStyle(ButtonStyle.Success)
            );

            await i.channel.send({ embeds: [embed], components: [row] });
            return i.reply({ content: "✅ Painel criado!", ephemeral: true });
        }

        // 3. LÓGICA DO CARRINHO (IGUAL A SEGUNDA IMAGEM)
        if (i.isButton() && i.customId.startsWith('comprar_')) {
            const [_, nome, preco] = i.customId.split('_');
            
            // Criar canal de Checkout
            const canal = await i.guild.channels.create({
                name: `🛒-checkout-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel] }
                ]
            });

            const revisãoEmbed = new EmbedBuilder()
                .setTitle("Revisão do Pedido")
                .setDescription(`**Produto:** ${nome}\n**Valor:** R$ ${preco}\n**Estoque:** 93 unidades`)
                .setColor("#5865F2")
                .setThumbnail(i.message.embeds[0].image?.url);

            const rowCheckout = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ir_pagamento').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user}`, embeds: [revisãoEmbed], components: [rowCheckout] });
            await i.reply({ content: `Carrinho aberto: ${canal}`, ephemeral: true });
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}
